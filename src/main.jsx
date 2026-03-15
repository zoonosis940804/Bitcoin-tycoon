import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown error" };
  }
  componentDidCatch(error, info) {
    console.error("App crash:", error, info);
  }
  render() {
    if (this.state?.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: "sans-serif" }}>
          <h2>앱 오류가 발생했습니다.</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.message}</pre>
          <p>브라우저 콘솔(F12) 내용 캡처해서 보내주세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
