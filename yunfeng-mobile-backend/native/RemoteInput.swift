// 输入注入 helper：解析 CLI 参数并注入 CGEvent（鼠标移动/点击/滚动、键盘）。
// 运行需要「辅助功能」权限；编译：scripts/build-native.sh → bin/yf-input。

import CoreGraphics
import Foundation

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

func argDouble(_ args: [String], _ i: Int, _ name: String) -> Double {
    guard i < args.count, let v = Double(args[i]) else { fail("参数缺失或非法: \(name)") }
    return v
}

func postMouse(type: CGEventType, point: CGPoint, button: CGMouseButton) {
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
        fail("无法创建鼠标事件")
    }
    event.post(tap: .cghidEventTap)
}

func main() {
    let args = CommandLine.arguments
    guard args.count >= 2 else { fail("用法: yf-input --move X Y | --click X Y [left|right] | --scroll X Y DY | --key KEYCODE DOWN") }

    switch args[1] {
    case "--move":
        let x = argDouble(args, 2, "X")
        let y = argDouble(args, 3, "Y")
        postMouse(type: .mouseMoved, point: CGPoint(x: x, y: y), button: .left)
    case "--click":
        let x = argDouble(args, 2, "X")
        let y = argDouble(args, 3, "Y")
        let button: CGMouseButton = (args.count >= 5 && args[4] == "right") ? .right : .left
        let (down, up): (CGEventType, CGEventType) = button == .right ? (.rightMouseDown, .rightMouseUp) : (.leftMouseDown, .leftMouseUp)
        postMouse(type: down, point: CGPoint(x: x, y: y), button: button)
        postMouse(type: up, point: CGPoint(x: x, y: y), button: button)
    case "--scroll":
        let x = argDouble(args, 2, "X")
        let y = argDouble(args, 3, "Y")
        let dy = argDouble(args, 4, "DY")
        postMouse(type: .mouseMoved, point: CGPoint(x: x, y: y), button: .left)
        guard let scroll = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: Int32(dy), wheel2: 0, wheel3: 0) else {
            fail("无法创建滚动事件")
        }
        scroll.post(tap: .cghidEventTap)
    case "--key":
        guard args.count >= 4, let code = UInt16(args[2]) else { fail("--key KEYCODE DOWN") }
        let down = args.count < 5 || args[4] == "1"
        guard let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down) else {
            fail("无法创建键盘事件")
        }
        event.post(tap: .cghidEventTap)
    default:
        fail("未知命令: \(args[1])")
    }
}

main()
