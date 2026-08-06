"""Yunfeng 工作台浏览器冒烟测试（阶段 1）。

启动 Vite 并在浏览器中 stub 任务 API，验证前端在不依赖真实后端时：
- 按真实任务状态分组展示
- 新任务创建成功即打开并显示 running
- 旧会话浏览与懒关联导入
- 搜索 / 项目筛选 / 归档筛选 / 重命名 / 恢复归档
- URL 深链接 ?task=<id>
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


def make_task(overrides: dict) -> dict:
    base = {
        "schemaVersion": 1,
        "sessionId": "session-" + overrides.get("id", "x"),
        "cwd": "/Volumes/base/project/Yunfeng",
        "title": "未命名任务",
        "source": "task",
        "status": "waiting_input",
        "phase": "unknown",
        "currentAction": "",
        "activeToolNames": [],
        "pendingApprovalIds": [],
        "createdAt": "2026-08-05T06:00:00.000Z",
        "updatedAt": "2026-08-05T07:00:00.000Z",
        "lastEventSeq": 0,
    }
    base.update(overrides)
    return base


TASKS = [
    make_task({
        "id": "task-running",
        "title": "优化上下文压缩策略",
        "status": "running",
        "phase": "implementing",
        "currentAction": "正在修改 task-runtime",
        "updatedAt": "2026-08-05T07:55:00.000Z",
    }),
    make_task({
        "id": "task-waiting",
        "title": "修复会话恢复问题",
        "status": "waiting_input",
        "phase": "planning",
        "updatedAt": "2026-08-05T07:45:00.000Z",
    }),
    make_task({
        "id": "task-attention",
        "title": "发布前检查",
        "status": "failed",
        "attentionReason": "模型请求超时，需要你决定是否重试",
        "updatedAt": "2026-08-05T07:40:00.000Z",
    }),
    make_task({
        "id": "task-completed",
        "title": "论文阅读",
        "status": "completed",
        "phase": "done",
        "cwd": "/Volumes/base/project/Research",
        "updatedAt": "2026-08-04T07:55:00.000Z",
    }),
    make_task({
        "id": "task-archived",
        "title": "旧归档任务",
        "status": "archived",
        "updatedAt": "2026-08-01T07:00:00.000Z",
    }),
]

# 动态创建的任务（POST /api/tasks 后追加），模拟真实持久化
CREATED_TASKS: list[dict] = []


def all_tasks() -> list[dict]:
    return TASKS + CREATED_TASKS

LEGACY_SESSIONS = [
    {
        "id": "legacy-session",
        "name": "旧版会话",
        "firstMessage": "帮我重构 rpc-manager",
        "cwd": "/Volumes/base/project/Yunfeng",
        "modified": "2026-08-03T09:00:00.000Z",
        "messageCount": 12,
    },
]


def fulfill_api(route: Route, empty: bool = False) -> None:
    request = route.request
    url = request.url
    path = url.split("?", 1)[0]

    if path.endswith("/api/models"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "modelList": [
                    {"provider": "anthropic", "id": "claude-sonnet", "name": "Claude Sonnet"},
                    {"provider": "openai", "id": "gpt-5-mini", "name": "GPT-5 mini"},
                ],
                "defaultModel": {"provider": "anthropic", "modelId": "claude-sonnet"},
                "thinkingLevels": {"anthropic:claude-sonnet": ["off", "low", "high"]},
                "thinkingLevelPins": {},
            }),
        )
        return

    if path.endswith("/api/tasks/events"):
        body = f"data: {json.dumps({'type': 'task_snapshot', 'tasks': [] if empty else all_tasks(), 'seq': 0})}\n\n"
        route.fulfill(
            status=200,
            headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"},
            body=body,
        )
        return

    if path.endswith("/api/tasks") and request.method == "GET":
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"tasks": [] if empty else all_tasks(), "total": len(all_tasks())}),
        )
        return

    if path.endswith("/api/tasks") and request.method == "POST":
        payload = request.post_data_json
        new_task = make_task({
            "id": "task-created",
            "title": payload.get("message", "")[:60],
            "status": "running",
            "phase": "planning",
            "cwd": payload.get("cwd", ""),
            "updatedAt": "2026-08-05T08:00:00.000Z",
        })
        CREATED_TASKS.append(new_task)
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"task": new_task, "sessionId": "session-task-created"}),
        )
        return

    if path.endswith("/api/tasks/import-session"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"task": make_task({
                "id": "task-legacy",
                "title": "旧版会话",
                "source": "legacy",
                "status": "waiting_input",
                "sessionId": "legacy-session",
            })}),
        )
        return

    if "/api/tasks/" in path and path.endswith("/commands"):
        payload = request.post_data_json
        # 模拟 followUp 失败，用于验证乐观失败状态与重发
        if payload and payload.get("type") == "followUp":
            route.fulfill(
                status=500,
                content_type="application/json",
                body=json.dumps({"error": {"code": "command_failed", "message": "模拟发送失败", "retryable": True}}),
            )
            return
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "result": None}))
        return

    if "/api/tasks/" in path and path.endswith("/conversation"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"context": {"messages": [
                {"id": "user-1", "role": "user", "content": "检查发布风险"},
                {"id": "assistant-1", "role": "assistant", "content": "这是 **历史消息**。\n\n```ts\nconst ready = true;\n```"},
            ]}}),
        )
        return

    if "/api/tasks/" in path and path.endswith("/capabilities"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"capabilities": {
                "model": {"provider": "anthropic", "modelId": "claude-sonnet"},
                "thinkingLevel": "low",
                "activeTools": [],
                "tools": [
                    {"name": "read", "active": True},
                    {"name": "bash", "active": True},
                    {"name": "edit", "active": True},
                ],
            }}),
        )
        return

    if "/api/tasks/" in path and path.endswith("/events"):
        # 打开任务时订阅该任务事件流；data 不含 status 以避免前端误改变任务状态
        task_id = path.split("/api/tasks/")[1].split("/")[0]
        event = {"type": "task_updated", "taskId": task_id, "data": {"phase": "planning"}}
        body = f"data: {json.dumps(event)}\n\n"
        route.fulfill(
            status=200,
            headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"},
            body=body,
        )
        return

    if "/api/tasks/" in path and request.method == "GET":
        # 单个任务详情：从 TASKS 找，找不到返回创建的任务
        task_id = path.split("/")[-1]
        task = next((t for t in all_tasks() if t["id"] == task_id), None)
        if task:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"task": task}))
        else:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"task": make_task({"id": task_id})}))
        return

    if "/api/tasks/" in path and request.method == "PATCH":
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"task": make_task({"id": "task-waiting", "title": request.post_data_json.get("name", "")})}),
        )
        return

    if path.endswith("/api/sessions"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"sessions": [] if empty else LEGACY_SESSIONS}),
        )
        return

    if path.endswith("/api/agent/running/events"):
        body = 'data: {"type":"running","runningSessionIds":[]}\n\n'
        route.fulfill(status=200, headers={"Content-Type": "text/event-stream"}, body=body)
        return

    route.fulfill(status=404, content_type="application/json", body=json.dumps({"error": "not mocked"}))


def assert_workbench_has_no_horizontal_overflow(page: Page) -> None:
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")


def verify_task_workbench(page: Page) -> None:
    create_payloads: list[dict] = []
    import_payloads: list[dict] = []
    command_payloads: list[dict] = []

    def route_api(route: Route) -> None:
        request = route.request
        if request.method == "POST" and request.post_data_json:
            payload = request.post_data_json
            if request.url.endswith("/api/tasks"):
                create_payloads.append(payload)
            elif request.url.endswith("/api/tasks/import-session"):
                import_payloads.append(payload)
            elif "/api/tasks/" in request.url and request.url.endswith("/commands"):
                command_payloads.append(payload)
        fulfill_api(route)

    page.route("**/api/**", route_api)
    page.goto(DEV_URL, wait_until="networkidle")

    sidebar = page.get_by_role("complementary", name="任务列表")
    expect(sidebar).to_be_visible()
    page.wait_for_timeout(600)

    # 真实状态分组展示
    expect(page.locator(".session-sidebar__group-heading", has_text="需要你介入")).to_be_visible()
    expect(page.locator(".session-sidebar__group-heading", has_text="正在进行")).to_be_visible()
    expect(page.locator(".session-sidebar__group-heading", has_text="等待继续")).to_be_visible()
    expect(page.locator(".session-sidebar__group-heading", has_text="已完成")).to_be_visible()
    expect(page.locator(".session-sidebar__group-heading", has_text="旧会话")).to_be_visible()
    # 归档默认隐藏
    expect(page.locator(".session-sidebar__group-heading", has_text="已归档")).not_to_be_visible()

    # 打开失败任务：显示真实失败状态而非“已完成”
    page.get_by_role("button", name="打开任务：发布前检查").click()
    panel = page.get_by_role("region", name="当前任务")
    expect(panel).to_be_visible()
    expect(panel.get_by_text("本轮运行失败")).to_be_visible()
    expect(panel.get_by_text("模型请求超时，需要你决定是否重试")).to_be_visible()
    # URL 深链接
    assert "?task=task-attention" in page.url
    page.get_by_role("button", name="关闭任务").click()

    # 打开运行中任务：显示“Agent 正在工作”与阶段、运行控制、steer/followUp 切换
    page.get_by_role("button", name="打开任务：优化上下文压缩策略").click()
    panel = page.get_by_role("region", name="当前任务")
    expect(panel.get_by_text("Agent 正在工作")).to_be_visible()
    expect(panel.get_by_text("实现中")).to_be_visible()
    # 运行控制：中止 / 清空排队
    expect(panel.get_by_role("button", name="中止运行")).to_be_visible()
    expect(panel.get_by_role("button", name="清空排队")).to_be_visible()
    # 运行配置：打开后模型/思考等级/工具切换在运行中禁用
    panel.get_by_role("button", name="运行配置 · 运行中禁切").click()
    expect(panel.get_by_label("模型")).to_be_disabled()
    expect(panel.get_by_label("思考等级")).to_be_disabled()
    expect(panel.get_by_text("bash")).to_be_visible()
    panel.get_by_role("button", name="运行配置 · 运行中禁切").click()
    # steer/followUp 切换（运行中默认 steer）
    expect(panel.get_by_role("group", name="下一轮处理方式")).to_be_visible()
    expect(panel.get_by_role("button", name="steer 影响当前运行")).to_have_attribute("aria-pressed", "true")
    # 发送运行中消息 → 乐观状态 + 默认 steer 命令
    panel.get_by_label("输入消息").fill("停一下并汇报进度")
    panel.get_by_role("button", name="转向").click()
    assert any(cmd.get("type") == "steer" for cmd in command_payloads)
    # 切换到“下一轮处理”发送 → 触发 followUp 失败 → 乐观消息标记失败并可重发
    panel.get_by_role("button", name="下一轮处理").click()
    assert panel.get_by_role("button", name="下一轮处理").get_attribute("aria-pressed") == "true"
    panel.get_by_label("输入消息").fill("这条会失败")
    panel.get_by_role("button", name="发送到下一轮").click()
    expect(panel.get_by_text("模拟发送失败")).to_be_visible()
    expect(panel.locator(".conversation-message--failed")).to_be_visible()
    expect(panel.get_by_role("button", name="重新发送")).to_be_visible()
    page.get_by_role("button", name="关闭任务").click()

    # 等待任务：显示“等待继续”，不显示“已完成”
    page.get_by_role("button", name="打开任务：修复会话恢复问题").click()
    panel = page.get_by_role("region", name="当前任务")
    expect(panel.get_by_text("等待继续")).to_be_visible()
    expect(panel.get_by_text("任务已完成")).not_to_be_visible()
    page.get_by_role("button", name="关闭任务").click()

    # 搜索过滤
    page.get_by_placeholder("搜索任务…").fill("论文")
    expect(page.locator(".session-sidebar__group-heading", has_text="已完成")).to_be_visible()
    expect(page.locator(".session-sidebar__group-heading", has_text="正在进行")).not_to_be_visible()
    page.get_by_placeholder("搜索任务…").fill("")

    # 项目筛选
    page.get_by_label("按项目筛选").select_option("Research")
    expect(page.get_by_role("button", name="打开任务：论文阅读")).to_be_visible()
    expect(page.get_by_role("button", name="打开任务：发布前检查")).not_to_be_visible()
    page.get_by_label("按项目筛选").select_option("")

    # 归档筛选 + 恢复
    page.get_by_role("button", name="已归档").click()
    expect(page.locator(".session-sidebar__group-heading", has_text="已归档")).to_be_visible()
    page.get_by_role("button", name="恢复").first.click()
    assert any(cmd.get("type") == "reopen" for cmd in command_payloads)
    page.get_by_role("button", name="进行中").click()

    # 重命名
    rename_button = page.locator(".task-row__action--rename").first
    rename_button.click()
    rename_button.click()
    rename_input = page.locator(".task-row__rename-input").first
    rename_input.fill("重命名后的任务")
    rename_input.press("Enter")
    expect(page.get_by_text("重命名后的任务")).to_be_visible()

    # 旧会话浏览 + 懒关联导入
    page.get_by_role("button", name="打开任务：旧版会话").click()
    panel = page.get_by_role("region", name="当前任务")
    expect(panel.get_by_text("旧会话 · 首次发送消息后接入任务")).to_be_visible()
    expect(panel.get_by_role("button", name="发送并接入任务")).to_be_visible()
    page.get_by_label("输入消息").fill("继续重构")
    page.get_by_label("输入消息").press("Enter")
    assert import_payloads[-1] == {"sessionId": "legacy-session"}

    # 新任务创建成功即打开并显示 running
    page.get_by_role("button", name="新建任务").first.click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("项目路径").fill("/Volumes/base/project/Yunfeng")
    dialog.get_by_label("你想聊什么？").fill("检查工作台")
    dialog.get_by_role("button", name="开始对话").click()
    expect(dialog).not_to_be_visible()
    assert create_payloads[-1]["cwd"] == "/Volumes/base/project/Yunfeng"
    panel = page.get_by_role("region", name="当前任务")
    expect(panel.get_by_text("Agent 正在工作")).to_be_visible()

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
                verify_task_workbench(browser.new_page(viewport={"width": 1440, "height": 1000}))
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
