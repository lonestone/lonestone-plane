# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Celery tasks of the fork, found by ``app.autodiscover_tasks()`` (``plane/celery.py``)."""

from celery import shared_task

from plane.extended.services.project_subscribers import notify_new_issue
from plane.utils.exception_logger import log_exception


@shared_task
def notify_project_subscribers_of_new_issue(issue_id: str) -> None:
    try:
        notify_new_issue(issue_id)
    except Exception as exception:  # noqa: BLE001  a failed notification must not fail the worker
        log_exception(exception)
