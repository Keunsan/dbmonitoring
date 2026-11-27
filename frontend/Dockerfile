FROM node:22-alpine AS build
WORKDIR /repo
# @/* → repo 루트 alias — docker-compose `web.build.context`는 저장소 루트 사용
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY . .
RUN cd frontend && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]