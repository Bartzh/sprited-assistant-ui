"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Assistant } from "./assistant";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetch('/api/verify', {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    }).then((res) => {
      if (!res.ok) {
        localStorage.removeItem("token");
        router.push("/login");
      }
    });
  }, [router]);

  return <Assistant />;
}
