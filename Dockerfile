# Cloud Run 用のイメージ（asia-northeast1）
#
# 算定エンジンは params/*.yaml を実行時に readFileSync で読む（src/params/index.ts）。
# **イメージに params を入れ忘れると、本番だけ「パラメータが見つかりません」で落ちる。**
# Next の standalone 出力に任せず、明示的に COPY する（壊れ方が静かなので、二重に担保する）。

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts：prepare が git のフックパスを設定するだけで、コンテナには git が無い
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
# Node.js 2026-10-21 のセキュリティリリース（CVE-2026-111497 ほか）より前の版では作らない。
# ベースイメージの取り違えやキャッシュで古い Node が入ったら、ここでビルドを止める。
RUN node -e "const m={22:[23,4],24:[22,1],26:[12,1]};const [a,b,c]=process.versions.node.split('.').map(Number);const min=m[a];const ok=a>26||(min&&(b>min[0]||(b===min[0]&&c>=min[1])));if(!ok){console.error('Node '+process.version+' は 2026-10-21 のセキュリティ修正より前か、サポート外');process.exit(1)}"
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run は PORT を渡してくる。standalone の server.js はこれを読む
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# root で動かさない
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# standalone 出力は public/ を含まない。入れ忘れると、LP の家族画像（public/lp/）が
# 本番だけ 404 になり、代わりに alt の文字が出る（2026-10-15 に実際に起きた）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/params ./params

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
