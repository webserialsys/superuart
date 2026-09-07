import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError


spec = importlib.util.spec_from_file_location(
    "notify_telegram", Path(__file__).parents[1] / "scripts" / "notify_telegram.py"
)
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)


class NotificationTests(unittest.TestCase):
    def test_failed_job_and_skipped_dependants_are_reported_individually(self):
        message = notify.format_message(
            {
                "backend-test": {"result": "success"},
                "sonar-backend": {"result": "failure"},
                "backend-build": {"result": "skipped"},
            },
            "feature/check", "abcdef012345", "https://example.com/run/1",
        )
        self.assertIn("CI: failure", message)
        self.assertIn("Backend test: success", message)
        self.assertIn("SonarQube backend: failure", message)
        self.assertIn("Backend build: skipped", message)
        self.assertIn("Commit: abcdef0", message)

    def test_optional_docker_jobs_do_not_make_successful_branch_run_fail(self):
        message = notify.format_message(
            {"frontend-build": {"result": "success"}, "docker-build-frontend": {"result": "skipped"}},
            "main", "abc", "url",
        )
        self.assertIn("CI: success", message)
        self.assertIn("Docker build frontend: skipped", message)

    def test_cancelled_and_all_skipped_runs_are_not_reported_as_success(self):
        for result in ("cancelled", "skipped"):
            with self.subTest(result=result):
                message = notify.format_message({"new-job": {"result": result}}, "main", "abc", "url")
                self.assertIn(f"CI: {result}", message)
                self.assertIn(f"new-job: {result}", message)

    def test_request_preserves_newlines_unicode_and_special_characters(self):
        message = "Backend test: success\nBranch: исправление&check%20"
        with patch.object(notify, "urlopen", return_value=io.BytesIO(b'{"ok":true}')) as send:
            notify.send_message("test-token", "123", message)
        request = send.call_args.args[0]
        self.assertEqual(json.loads(request.data), {"chat_id": "123", "text": message})
        self.assertEqual(send.call_args.kwargs["timeout"], 30)

    def test_api_rejection_is_a_failure_even_with_http_200(self):
        with patch.object(notify, "urlopen", return_value=io.BytesIO(b'{"ok":false}')):
            with self.assertRaisesRegex(RuntimeError, "rejected"):
                notify.send_message("test-token", "123", "message")

    def test_transport_errors_do_not_expose_token(self):
        for error in (
            HTTPError("https://example.com/test-token", 401, "test-token", {}, None),
            URLError("test-token"),
        ):
            with self.subTest(error=type(error).__name__):
                with patch.object(notify, "urlopen", side_effect=error):
                    with self.assertRaises(RuntimeError) as caught:
                        notify.send_message("test-token", "123", "message")
                self.assertNotIn("test-token", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
