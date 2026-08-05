"""Yunfeng workbench browser checks.

The test starts Vite and stubs API responses in the browser, so it verifies the
frontend without requiring the Node backend to be running.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, Route, expect, sync_playwright


APP_DIR = Path(__file__).resolve().parents[1]
DEV_URL = "http://127.0.0.1:4173"


SESSIONS = [
    {
        "id": "attention-session",
        "name": "发布前检查",
        "firstMessage": "检查发布风险",
        "cwd": "/Volumes/base/project/Yunfeng",
        "modified": "2026-08-05T07:59:00.000Z",
        "messageCount": 5,
        "attentionReason": "发现两种实现路径，需要你选择",
    },
    {
        "id": "running-session",
        "name": "优化上下文压缩策略",
        "firstMessage": "优化上下文压缩策略",
        "cwd": "/Volumes/base/project/Yunfeng",
        "modified": "2026-08-05T07:55:00.000Z",
        "messageCount": 3,
    },
    {
        "id": "completed-session",
        "name": "论文阅读",
        "firstMessage": "收集论文",
        "cwd": "/Volumes/base/project/Research",
        "modified": "2026-08-04T07:55:00.000Z",
        "messageCount": 8,
    },
]


def fulfill_api(route: Route, empty: bool = False) -> None:
    request = route.request
    url = request.url

    if url.endswith("/api/sessions"):
        payload = {"sessions": [] if empty else SESSIONS, "runningSessionIds": [] if empty else ["running-session"]}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))
        return

    if url.endswith("/api/agent/running/events"):
        running_ids = [] if empty else ["running-session"]
        body = f'data: {json.dumps({"type": "running", "runningSessionIds": running_ids})}\n\n'
        route.fulfill(
            status=200,
            headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"},
            body=body,
        )
        return

    if request.method == "POST" and url.endswith("/api/agent/new"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"success": True, "sessionId": "new-session"}),
        )
        return

    if request.method == "POST" and "/api/agent/" in url:
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True}))
        return

    route.fulfill(status=404, content_type="application/json", body=json.dumps({"error": "not mocked"}))


def assert_workbench_has_no_horizontal_overflow(page: Page) -> None:
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")


def verify_populated_workbench(page: Page) -> None:
    page.route("**/api/**", lambda route: fulfill_api(route))
    page.goto(DEV_URL, wait_until="networkidle")

    expect(page.get_by_role("heading", name="需要你介入")).to_be_visible()
    expect(page.get_by_text("发布前检查")).to_be_visible()
    expect(page.get_by_role("heading", name="正在进行")).to_be_visible()
    expect(page.get_by_text("已完成", exact=True).first).to_be_visible()

    page.get_by_role("button", name="查看任务").first.click()
    expect(page.get_by_role("dialog")).to_be_visible()
    expect(page.get_by_role("heading", name="发布前检查")).to_be_visible()
    expect(page.get_by_role("dialog").get_by_text("发现两种实现路径，需要你选择", exact=True)).to_be_visible()
    page.get_by_role("button", name="关闭任务详情").click()
    expect(page.get_by_role("dialog")).not_to_be_visible()

    theme_button = page.get_by_role("button", name="切换主题，当前为跟随系统")
    theme_button.click()
    assert page.locator("html").get_attribute("data-theme") == "light"
    page.get_by_role("button", name="切换主题，当前为浅色主题").click()
    assert page.locator("html").get_attribute("data-theme") == "dark"

    page.get_by_role("button", name="新建任务").first.click()
    new_task_dialog = page.get_by_role("dialog")
    expect(new_task_dialog).to_be_visible()
    new_task_dialog.get_by_label("项目路径").fill("/Volumes/base/project/Yunfeng")
    new_task_dialog.get_by_label("你要完成什么？").fill("检查工作台的视觉状态")
    new_task_dialog.get_by_role("button", name="取消").click()
    expect(new_task_dialog).not_to_be_visible()

    page.set_viewport_size({"width": 720, "height": 900})
    assert_workbench_has_no_horizontal_overflow(page)


def verify_empty_workbench(page: Page) -> None:
    page.route("**/api/**", lambda route: fulfill_api(route, empty=True))
    page.goto(DEV_URL, wait_until="networkidle")
    expect(page.get_by_role("heading", name="工作台暂时安静。")).to_be_visible()
    expect(page.get_by_role("button", name="新建任务").last).to_be_visible()
    assert_workbench_has_no_horizontal_overflow(page)


def wait_for_dev_server() -> None:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(DEV_URL, timeout=1):
                return
        except (OSError, urllib.error.URLError):
            time.sleep(0.25)
    raise RuntimeError("Vite dev server did not start within 20 seconds")


def find_chromium_executable() -> str | None:
    cache_dir = Path.home() / "Library" / "Caches" / "ms-playwright"
    candidates = sorted(cache_dir.glob("chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell"))
    return str(candidates[-1]) if candidates else None


def main() -> None:
    env = os.environ.copy()
    process = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
        cwd=APP_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        wait_for_dev_server()
        with sync_playwright() as playwright:
            launch_options = {"headless": True}
            executable = find_chromium_executable()
            if executable:
                launch_options["executable_path"] = executable
            browser = playwright.chromium.launch(**launch_options)
            try:
                verify_populated_workbench(browser.new_page(viewport={"width": 1440, "height": 1000}))
                verify_empty_workbench(browser.new_page(viewport={"width": 1440, "height": 1000}))
            finally:
                browser.close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


if __name__ == "__main__":
    main()
