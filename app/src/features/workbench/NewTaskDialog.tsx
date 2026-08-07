import { App, Button, Form, Input, Modal } from "antd";
import { FolderOpen, Send, X } from "lucide-react";
import { useState } from "react";

import { DirectoryPickerDialog } from "./DirectoryPickerDialog";

interface NewTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (cwd: string, message: string) => Promise<void>;
}

interface NewTaskFormValues {
  message: string;
}

export function NewTaskDialog({ open, onClose, onCreate }: NewTaskDialogProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<NewTaskFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [cwd, setCwd] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);

  async function handleOk() {
    const values = await form.validateFields().catch(() => null);
    if (!values || submitting) return;
    const prompt = values.message.trim();
    if (!cwd) {
      setPathError("请先选择项目文件夹");
      return;
    }
    if (!prompt) return;

    setSubmitting(true);
    try {
      await onCreate(cwd, prompt);
      form.resetFields();
      setCwd("");
      setPathError(null);
      onClose();
      message.success("会话已创建");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建会话失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={
        <span className="new-task-dialog__title">
          <span className="eyebrow">开始一段新的对话</span>
          新建会话
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={submitting ? "正在创建" : "开始对话"}
      cancelText="取消"
      okButtonProps={{
        disabled: submitting,
        loading: submitting,
        icon: <Send size={14} />,
      }}
      closeIcon={<X size={16} aria-label="关闭新建会话" />}
      centered
      width={520}
      forceRender
    >
      <Form layout="vertical" form={form} className="new-task-dialog__form">
        <Form.Item label="项目文件夹" required validateStatus={pathError ? "error" : undefined} help={pathError}>
          <div className={`new-task-dialog__directory ${cwd ? "new-task-dialog__directory--selected" : ""}`}>
            <div>
              <FolderOpen size={17} aria-hidden="true" />
              <span title={cwd}>{cwd || "尚未选择项目文件夹"}</span>
            </div>
            <Button
              onClick={() => setPickerOpen(true)}
              disabled={submitting}
            >
              {cwd ? "重新选择" : "选择文件夹"}
            </Button>
          </div>
        </Form.Item>
        <Form.Item
          name="message"
          label="想让 Agent 做什么？"
          rules={[{ required: true, message: "请输入任务目标" }]}
        >
          <Input.TextArea
            placeholder="告诉 Agent 你想从哪里开始"
            rows={4}
            disabled={submitting}
          />
        </Form.Item>
      </Form>
      <DirectoryPickerDialog
        open={pickerOpen}
        initialPath={cwd || undefined}
        onCancel={() => setPickerOpen(false)}
        onSelect={(path) => {
          setCwd(path);
          setPathError(null);
          setPickerOpen(false);
        }}
      />
    </Modal>
  );
}
