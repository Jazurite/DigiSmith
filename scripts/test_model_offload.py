import os
import sys
import tempfile
import unittest
import urllib.error
from io import StringIO
from unittest.mock import patch

import model_offload


class TestReadProfileProvider(unittest.TestCase):
    def test_missing_file_returns_none(self):
        self.assertIsNone(
            model_offload.read_profile_provider("/nonexistent/path/profile")
        )

    def test_present_field_returns_value(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".profile", delete=False) as f:
            f.write("name: digismith\nmodel_offload_provider: chutes\n")
            path = f.name
        try:
            self.assertEqual(model_offload.read_profile_provider(path), "chutes")
        finally:
            os.unlink(path)

    def test_absent_field_returns_none(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".profile", delete=False) as f:
            f.write("name: digismith\n")
            path = f.name
        try:
            self.assertIsNone(model_offload.read_profile_provider(path))
        finally:
            os.unlink(path)


class TestOffload(unittest.TestCase):
    def setUp(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".profile", delete=False) as f:
            f.write("name: digismith\nmodel_offload_provider: chutes\n")
            self.profile_path = f.name

    def tearDown(self):
        os.unlink(self.profile_path)

    def test_skips_when_provider_not_chutes(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".profile", delete=False) as f:
            f.write("name: personal\n")
            other_path = f.name
        try:
            content, status = model_offload.offload("hello", other_path)
            self.assertIsNone(content)
            self.assertIn("skipped", status)
        finally:
            os.unlink(other_path)

    @patch("model_offload.get_chutes_api_key", return_value=None)
    def test_skips_when_no_credentials(self, _mock):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("no chutes credentials", status)

    @patch("model_offload.call_chutes", return_value="generated text")
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_success(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertEqual(content, "generated text")
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

    @patch("model_offload.call_chutes", return_value="   ")
    @patch("model_offload.get_chutes_api_key", return_value="cpk_fake")
    def test_failure_on_empty_response(self, _mock_key, _mock_call):
        content, status = model_offload.offload("hello", self.profile_path)
        self.assertIsNone(content)
        self.assertIn("empty", status)


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
