import json
import os
import shutil
import sys
import tempfile
import unittest
import urllib.error
from io import StringIO
from unittest.mock import patch

import model_offload

VALID_HTML = "<!doctype html>\n<html lang=\"en\"><body>ok</body>\n</html>"


class _FakeResponse:
    """Minimal stand-in for the object urlopen returns as a context manager."""

    def __init__(self, payload_bytes):
        self._payload = payload_bytes

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class TestReadProfileProvider(unittest.TestCase):
    def setUp(self):
        # Create a temporary directory to act as DigiSmith's repo
        self.temp_repo_dir = tempfile.mkdtemp()

        # Create .claude-plugin/plugin.json
        plugin_dir = os.path.join(self.temp_repo_dir, ".claude-plugin")
        os.makedirs(plugin_dir, exist_ok=True)
        plugin_json = os.path.join(plugin_dir, "plugin.json")
        with open(plugin_json, "w", encoding="utf-8") as f:
            json.dump({"name": "digismith"}, f)

        # Create profiles/digismith.yml
        profiles_dir = os.path.join(self.temp_repo_dir, "profiles")
        os.makedirs(profiles_dir, exist_ok=True)
        self.profile_yml = os.path.join(profiles_dir, "digismith.yml")
        with open(self.profile_yml, "w", encoding="utf-8") as f:
            f.write("name: digismith\nmodel_offload_provider: chutes\n")

        # Create the pointer file (one-line profile name)
        self.pointer_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".profile", delete=False
        )
        self.pointer_file.write("digismith")
        self.pointer_file.close()

        # Save original cwd and change to temp repo
        self.original_cwd = os.getcwd()
        os.chdir(self.temp_repo_dir)

    def tearDown(self):
        try:
            # Restore cwd first, before cleanup
            os.chdir(self.original_cwd)
        finally:
            # Clean up files
            try:
                os.unlink(self.pointer_file.name)
            except OSError:
                pass
            try:
                shutil.rmtree(self.temp_repo_dir)
            except OSError:
                pass

    def test_missing_pointer_file_returns_none(self):
        self.assertIsNone(
            model_offload.read_profile_provider("/nonexistent/path/profile")
        )

    def test_present_field_returns_value(self):
        self.assertEqual(
            model_offload.read_profile_provider(self.pointer_file.name), "chutes"
        )

    def test_absent_field_returns_none(self):
        # Create a profile without the model_offload_provider field
        with open(self.profile_yml, "w", encoding="utf-8") as f:
            f.write("name: digismith\n")

        self.assertIsNone(
            model_offload.read_profile_provider(self.pointer_file.name)
        )

    def test_inline_comment_is_stripped(self):
        with open(self.profile_yml, "w", encoding="utf-8") as f:
            f.write(
                "name: digismith\n"
                "model_offload_provider: chutes   # optional; absent = feature off\n"
            )

        self.assertEqual(
            model_offload.read_profile_provider(self.pointer_file.name), "chutes"
        )

    def test_quoted_value_is_unwrapped(self):
        with open(self.profile_yml, "w", encoding="utf-8") as f:
            f.write("name: digismith\nmodel_offload_provider: \"chutes\"\n")

        self.assertEqual(
            model_offload.read_profile_provider(self.pointer_file.name), "chutes"
        )

    def test_indented_quoted_value_with_comment(self):
        with open(self.profile_yml, "w", encoding="utf-8") as f:
            f.write("name: digismith\n  model_offload_provider: 'chutes' # on\n")

        self.assertEqual(
            model_offload.read_profile_provider(self.pointer_file.name), "chutes"
        )

    def test_non_utf8_profile_yml_returns_none(self):
        with open(self.profile_yml, "wb") as f:
            f.write(b"name: digismith\nmodel_offload_provider: \xff\xfe\n")

        self.assertIsNone(
            model_offload.read_profile_provider(self.pointer_file.name)
        )

    def test_non_utf8_plugin_json_returns_none(self):
        plugin_json = os.path.join(
            self.temp_repo_dir, ".claude-plugin", "plugin.json"
        )
        with open(plugin_json, "wb") as f:
            f.write(b'{"name": "\xff\xfedigismith"}')

        self.assertIsNone(
            model_offload.read_profile_provider(self.pointer_file.name)
        )

    def test_no_digismith_repo_returns_none(self):
        # Change to a genuinely empty temporary directory without .claude-plugin/plugin.json
        empty_temp_dir = tempfile.mkdtemp()
        try:
            os.chdir(empty_temp_dir)
            result = model_offload.read_profile_provider(self.pointer_file.name)
            self.assertIsNone(result)
        finally:
            # Always restore to temp repo so tearDown doesn't fail
            os.chdir(self.temp_repo_dir)
            try:
                shutil.rmtree(empty_temp_dir)
            except OSError:
                pass


class TestOffload(unittest.TestCase):
    def setUp(self):
        # Create a temporary directory to act as DigiSmith's repo
        self.temp_repo_dir = tempfile.mkdtemp()

        # Create .claude-plugin/plugin.json
        plugin_dir = os.path.join(self.temp_repo_dir, ".claude-plugin")
        os.makedirs(plugin_dir, exist_ok=True)
        plugin_json = os.path.join(plugin_dir, "plugin.json")
        with open(plugin_json, "w", encoding="utf-8") as f:
            json.dump({"name": "digismith"}, f)

        # Create profiles/digismith.yml with chutes provider
        profiles_dir = os.path.join(self.temp_repo_dir, "profiles")
        os.makedirs(profiles_dir, exist_ok=True)
        self.profile_yml = os.path.join(profiles_dir, "digismith.yml")
        with open(self.profile_yml, "w", encoding="utf-8") as f:
            f.write("name: digismith\nmodel_offload_provider: chutes\n")

        # Create the pointer file (one-line profile name)
        self.pointer_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".profile", delete=False
        )
        self.pointer_file.write("digismith")
        self.pointer_file.close()
        self.profile_path = self.pointer_file.name

        # Save original cwd and change to temp repo
        self.original_cwd = os.getcwd()
        os.chdir(self.temp_repo_dir)

    def tearDown(self):
        try:
            # Restore cwd first, before cleanup
            os.chdir(self.original_cwd)
        finally:
            # Clean up files
            try:
                os.unlink(self.profile_path)
            except OSError:
                pass
            try:
                shutil.rmtree(self.temp_repo_dir)
            except OSError:
                pass

    def test_skips_when_provider_not_chutes(self):
        # Create a profile with a different provider
        with open(self.profile_yml, "w", encoding="utf-8") as f:
            f.write("name: digismith\nmodel_offload_provider: openai\n")

        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("skipped", status)

    @patch("model_offload.get_chutes_api_key", return_value=None)
    def test_skips_when_no_credentials(self, _mock):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("no chutes credentials", status)

    def test_skips_when_not_digismith_repo(self):
        empty_temp_dir = tempfile.mkdtemp()
        try:
            os.chdir(empty_temp_dir)
            content, status = model_offload.offload("hello", self.profile_path)
            self.assertIsNone(content)
            self.assertIn("not DigiSmith's own repo", status)
        finally:
            os.chdir(self.temp_repo_dir)
            try:
                shutil.rmtree(empty_temp_dir)
            except OSError:
                pass

    @patch("model_offload.call_chutes", return_value=VALID_HTML)
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_success(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertEqual(content, VALID_HTML)
        self.assertIn("success", status)

    @patch(
        "model_offload.call_chutes",
        side_effect=urllib.error.HTTPError(
            url="x", code=429, msg="rate limited", hdrs=None, fp=None
        ),
    )
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_failure_on_http_error(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("failed", status)

    @patch("model_offload.call_chutes", side_effect=TimeoutError("The read operation timed out"))
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_failure_on_timeout_error(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("failed", status)

    @patch("model_offload.call_chutes", return_value="   ")
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_failure_on_empty_response(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("empty", status)

    def _assert_shape_rejected(self, returned):
        with patch("model_offload.get_chutes_api_key", return_value="cpk_fake"), patch(
            "model_offload.call_chutes", return_value=returned
        ):
            content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("failed", status)
        self.assertIn("malformed HTML shape", status)

    def test_failure_when_not_starting_with_doctype(self):
        self._assert_shape_rejected("Here is your document:\n<html></html>")

    def test_failure_when_not_ending_with_html_close(self):
        self._assert_shape_rejected("<!doctype html>\n<html><body>truncated")

    def test_failure_on_unsubstituted_placeholder(self):
        self._assert_shape_rejected(
            "<!doctype html>\n<html><body>{{BODY_SECTIONS}}</body></html>"
        )

    def test_failure_on_markdown_code_fence(self):
        self._assert_shape_rejected(
            "```html\n<!doctype html>\n<html><body>ok</body></html>\n```"
        )

    def test_accepts_uppercase_doctype_and_trailing_whitespace(self):
        with patch("model_offload.get_chutes_api_key", return_value="cpk_fake"), patch(
            "model_offload.call_chutes",
            return_value="<!DOCTYPE html>\n<html><body>ok</body></html>\n\n",
        ):
            content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNotNone(content)
        self.assertIn("success", status)

    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    @patch("urllib.request.urlopen")
    def test_failure_on_array_response(self, mock_urlopen, _mock_key):
        mock_urlopen.return_value = _FakeResponse(b"[]")
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("failed", status)

    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    @patch("urllib.request.urlopen")
    def test_failure_on_content_as_list(self, mock_urlopen, _mock_key):
        payload = {
            "choices": [
                {"message": {"content": [{"type": "text", "text": "<!doctype html>"}]}}
            ]
        }
        mock_urlopen.return_value = _FakeResponse(json.dumps(payload).encode("utf-8"))
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("failed", status)

    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    @patch("urllib.request.urlopen")
    def test_failure_on_non_utf8_response_body(self, mock_urlopen, _mock_key):
        mock_urlopen.return_value = _FakeResponse(b"\xff\xfe not utf-8")
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("failed", status)

    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    @patch("urllib.request.urlopen")
    def test_success_through_call_chutes(self, mock_urlopen, _mock_key):
        payload = {"choices": [{"message": {"content": VALID_HTML}}]}
        mock_urlopen.return_value = _FakeResponse(json.dumps(payload).encode("utf-8"))
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertEqual(content, VALID_HTML)
        self.assertIn("success", status)


class TestMainErrorHandling(unittest.TestCase):
    def test_main_handles_missing_prompt_file(self):
        """Test main() gracefully handles missing prompt file."""
        # Capture stderr
        captured_err = StringIO()
        old_stderr = sys.stderr
        sys.stderr = captured_err

        try:
            with self.assertRaises(SystemExit) as cm:
                # Save original argv
                old_argv = sys.argv
                try:
                    sys.argv = [
                        "model_offload.py",
                        "--prompt-file",
                        "/nonexistent/path/file.txt",
                    ]
                    model_offload.main()
                finally:
                    sys.argv = old_argv

            # Verify exit code is 1
            self.assertEqual(cm.exception.code, 1)

            # Verify stderr contains the expected error message format
            err_output = captured_err.getvalue()
            self.assertIn("offload: failed", err_output)
            self.assertIn("cannot read prompt file", err_output)
        finally:
            sys.stderr = old_stderr


if __name__ == "__main__":
    unittest.main()
