"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "../../components/login-form";
import { LoadingScreen } from "../../components/loading-screen";
import { useAuth } from "../../lib/auth-context";

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_missing_code: "登录链接不完整，请重新获取后再试。",
  auth_exchange_failed: "登录链接验证失败，请重新获取后再试。",
  viewer_bootstrap_failed: "账号验证成功，但工作空间加载失败，请重试。",
  auth_callback_timeout: "登录超时，请重试。",
};

function LoginPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const initialErrorMessage = callbackError
    ? CALLBACK_ERROR_MESSAGES[callbackError] ??
      "登录失败，请重试。"
    : null;

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading || user) return <LoadingScreen />;

  return (
    <AuthShell
      title="欢迎回来"
      description="登录后继续你的创作。"
      features={[
        "支持密码、邮件链接或 Google 登录",
        "统一管理画布和工作空间",
        "从想法到作品，在这里完成",
      ]}
    >
      <LoginForm initialErrorMessage={initialErrorMessage} />
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginPageContent />
    </Suspense>
  );
}
