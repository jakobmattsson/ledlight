# Unit tests pending isolation

These tests directly load more than one production file. They continue to run
in the unit and full test suites while their dependencies are reviewed. Their
paths mirror `src` so each test can move back to `tests/unit` when it meets the
direct-load convention.
