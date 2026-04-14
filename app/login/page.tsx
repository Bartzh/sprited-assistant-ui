"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import bcrypt from "bcryptjs";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState<string>("");
  useEffect(() => {
    setUserName(localStorage.getItem("user_name") || "");
  }, []);
  const system_regex = new RegExp("system", "i");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    if (!system_regex.test(userName.trim())) {
      localStorage.setItem("user_name", userName.trim());
    }
    else {
      alert("用户名格式错误");
      return;
    }

    e.preventDefault();

    const hashedPassword = await bcrypt.hash(password, 8);

    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "username": username,
        "password": hashedPassword }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem("token", data.access_token);
      router.push("/"); // 登录成功跳转首页
    } else {
      alert("登录失败，请检查用户名或密码");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4 py-4">
      <div className="w-full max-w-md p-6 sm:p-8 bg-white rounded-2xl shadow-xl mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">登录</h1>
          <p className="text-slate-500 text-sm">欢迎回来</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              账户名
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              密码
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              用户名
            </label>
            <Input
              placeholder="AI会把这个当作你的名字"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full mt-6">
            登录
          </Button>
        </form>
      </div>
    </div>
  );
}