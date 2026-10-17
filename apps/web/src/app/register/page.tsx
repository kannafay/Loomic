"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthShell } from "../../components/auth/auth-shell";
import { LoadingScreen } from "../../components/loading-screen";
import { RegisterForm } from "../../components/register-form";
import { useAuth } from "../../lib/auth-context";

export default function RegisterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading || user) return <LoadingScreen />;

  return (
    <AuthShell
      title="创建工作空间账号"
      description="使用邮箱和密码注册，即可在不同设备上继续编辑画布。"
      features={[
        "使用邮箱和密码创建专属账号",
        "验证邮箱后即可进入工作空间",
        "注册后即可使用完整的工作空间界面",
      ]}
    >
      <RegisterForm />
    </AuthShell>
  );
}
