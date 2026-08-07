import { App, Form, Input, Modal } from "antd";
import { FolderOpen, Send, X } from "lucide-react";
import { useState } from "react";

interface NewTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (cwd: string, message: string) => Promise<void>;
}

interface NewTaskFormValues {
  cwd: string;
  message: string;
}

export function NewTaskDialog({ open, onClose, onCreate }: NewTaskDialogProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<NewTaskFormValues>();
  const [submitting, setSubmitting] = useState(false);

  async function handleOk() {
    const values = await form.validateFields().catch(() => null);
    if (!values || submitting) return;
    const cwd = values.cwd.trim();
    const prompt = values.message.trim();
    if (!cwd || !prompt) return;

    setSubmitting(true);
    try {
      await onCreate(cwd, prompt);
      form.resetFields();
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
        <Form.Item
          name="cwd"
          label="项目路径"
          rules={[{ required: true, message: "请输入项目路径" }]}
        >
          <Input
            prefix={<FolderOpen size={14} />}
            placeholder="/path/to/project"
            autoComplete="off"
            disabled={submitting}
          />
        </Form.Item>
        <Form.Item
          name="message"
          label="你想聊什么？"
          rules={[{ required: true, message: "请输入任务目标" }]}
        >
          <Input.TextArea
            placeholder="告诉 Agent 你想从哪里开始"
            rows={4}
            disabled={submitting}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
