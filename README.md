become-human的简单ui

需要使用nginx，加入配置：

```
location / {
    proxy_pass http://localhost:3000;
}

location /api {
    proxy_pass http://localhost:36262;
}

location /api/ws {
    proxy_pass http://localhost:36262;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;

    proxy_buffering off;
}
```

---

This is the [assistant-ui](https://github.com/assistant-ui/assistant-ui) starter project.

## Getting Started

First, add your OpenAI API key to `.env.local` file:

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

目前似乎有bug，dev下无法工作，必须build

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.
