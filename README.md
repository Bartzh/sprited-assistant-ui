become-human的简单ui

迟早要给它换了

需要使用nginx，加入配置：

```
location / {
    proxy_pass http://localhost:3000;
}

location /api {
    proxy_pass http://localhost:36262;
}
```

---

This is the [assistant-ui](https://github.com/Yonom/assistant-ui) starter project.

## Getting Started

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.
