import os
import tempfile
import unittest
import urllib.error
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


if __name__ == "__main__":
    unittest.main()
