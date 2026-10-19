import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";

import { App as AntApp } from "antd";

import { App } from "./App";
import { store } from "./store";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        {/* Ant Design App 提供 message/modal/notification 上下文 */}
        <AntApp>
          <App />
        </AntApp>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
);
