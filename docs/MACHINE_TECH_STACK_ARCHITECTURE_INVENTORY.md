# Inventory tech stack và architecture trên máy

**Ngày khảo sát:** 2026-08-04  
**Mục đích:** Nguồn tham khảo để Claude Code cân nhắc công nghệ và kiến trúc cho
`D:\Khoaluantn`. Tài liệu này mô tả những gì đã được quan sát trên máy; nó không
tự động phê duyệt một stack cho dự án khóa luận.

## 1. Phạm vi và độ tin cậy

Đã quét các vùng source code có thể nhận diện trong `D:\`, các thư mục người dùng
chính trong `C:\Users\firet`, cùng các project đã biết. Kết quả phát hiện gồm 28
Git worktree và 141 manifest/config sau khi bỏ qua dependency, vendor, fixture,
cache và phần mềm cài đặt.

Nguồn bằng chứng được dùng:

- Git root và cấu trúc thư mục.
- `package.json`, `requirements.txt`, `pyproject.toml`, Prisma schema.
- Docker Compose, README, source entrypoint và cấu hình database.
- Dấu hiệu source như React/Vite, Express, Mongoose, MySQL, WordPress và SQL.

Giới hạn:

- Các file nén (`zip`, `rar`, `7z`), PDF chỉ mô tả hệ thống và thư mục phần mềm
  cài đặt không được giải nén/phân tích như project nguồn.
- Không đọc `.env`, credential, recovery code hoặc secret.
- Không chạy ứng dụng, test, container, migration hay cài dependency.
- “Đã dùng” nghĩa là có bằng chứng trong source/config trên máy, không có nghĩa
  stack đó đang chạy, production-ready hoặc là lựa chọn tốt nhất.
- Các bản sao gần giống nhau được nhóm thành một họ dự án; đây không phải nhiều
  bằng chứng độc lập cho cùng một quyết định kiến trúc.

## 2. Tổng quan stack đã xuất hiện

| Lớp | Công nghệ đã quan sát |
|---|---|
| Frontend | React, React DOM, Vite, TypeScript, JavaScript, Tailwind CSS, Radix UI, shadcn, Material UI, Bootstrap, React Router, Recharts, Chart.js, Leaflet |
| Backend JavaScript | Node.js, Express, REST API, EJS, HTTP proxy/API Gateway, JWT, Passport, session auth, WebSocket |
| Backend Python | FastAPI, Uvicorn, Flask, Pydantic, Motor, APScheduler |
| Database | PostgreSQL, Prisma ORM, MongoDB, Mongoose, MySQL/MariaDB, SQL Server, LadybugDB |
| Cache và messaging | Redis, RabbitMQ/AMQP, Apache Kafka |
| AI/ML và data | pandas, NumPy, scikit-learn, XGBoost, joblib, CVXPY, SciPy, Plotly, Hugging Face Transformers, ONNX Runtime, LangChain |
| DevOps | Docker, Docker Compose, Docker Swarm config, healthcheck, volume, network, Prometheus client |
| Testing/quality | Playwright, Jest, Supertest, Vitest, Testing Library, Mocha, Chai, ESLint, Prettier, Husky, lint-staged |
| CMS/web truyền thống | WordPress, WooCommerce, PHP, Apache/XAMPP, MySQL, Elementor |
| Agent/code intelligence | MCP, Tree-sitter, knowledge graph, Graphology, Sigma.js, local graph database |

## 3. Các hệ thống kiến trúc lớn

### 3.1. Badminton community platform (`project-cnm`)

**Đường dẫn:** `D:\hoc\Cong Nghe Moi\project-cnm`

**Stack quan sát được:**

- Frontend: React + Vite + Tailwind CSS; React Router, Leaflet, ApexCharts và XLSX.
- Backend: Node.js + Express, JWT, Zod, upload/email, Prometheus client.
- Data: PostgreSQL 16 + Prisma; schema hiện có nhiều domain model.
- Integration: RabbitMQ (`amqplib`) và Redis (`ioredis`).
- Test: Playwright.
- Runtime: Docker Compose với API Gateway, các service và hạ tầng dùng chung.

**Architecture quan sát được:**

- Microservices phía sau một API Gateway.
- Service theo domain: auth, user, court, booking, payment, notification, report.
- Event-driven integration qua RabbitMQ.
- Redis cho cache/lock hoặc dữ liệu tạm theo implementation hiện có.
- PostgreSQL là persistence chính, Prisma là data access/schema layer.
- Có dấu hiệu outbox/event publishing trong shared backend và các domain service.

**Bằng chứng chính:**

- `package.json`
- `frontend/package.json`
- `infra/docker-compose.yml`
- `backend/prisma/schema.prisma`
- `backend/shared/lib/broker.js`
- `backend/shared/lib/outbox-worker.js`

**Giá trị tham khảo:** Mẫu đầy đủ nhất trên máy cho booking, thanh toán, event,
API Gateway và phân tách domain. Chi phí vận hành/độ phức tạp cao hơn modular
monolith; không nên sao chép mặc định chỉ vì cùng domain cầu lông.

### 3.2. CAB booking / ride-hailing platform

**Đường dẫn chính:** `D:\hoc\Big Data\DHHTTT18B-N12-cab-system`

**Bản sao:** `D:\hoc\Big Data\clone\DHHTTT18B-N12-cab-system`

**Stack quan sát được:**

- Frontend: ba React + Vite app cho customer, driver và admin; Tailwind CSS.
- Backend chính: Node.js + Express.
- AI services: Python + FastAPI + Uvicorn, pandas, scikit-learn, XGBoost.
- Data polyglot: MongoDB, PostgreSQL và Redis.
- Messaging: Apache Kafka qua `kafkajs`/`aiokafka`.
- Runtime: Docker Compose; repository còn mô tả Docker Swarm.

**Architecture quan sát được:**

- Polyglot microservices với API Gateway.
- Service theo capability: auth, booking, driver, user, payment, pricing, review,
  ride, notification, matching, surge pricing và ETA.
- Event-driven architecture qua Kafka.
- Database-per-service/data ownership ở mức cấu hình Compose.
- AI/ML tách thành service riêng; có rule-based fallback, model store và background
  retraining theo tài liệu dự án.
- Redis được dùng cho cache/geo/realtime state; WebSocket được mô tả cho live update.

**Bằng chứng chính:**

- `README.md`
- `infra/docker-compose/docker-compose.local.yml`
- `AI-ML/matching-service/requirements.txt`
- `AI-ML/surge-pricing-service/requirements.txt`
- `apps/*/package.json`
- `services/*/package.json`

**Giá trị tham khảo:** Mẫu cho hệ thống realtime, event streaming, data polyglot
và ML service. Đây là kiến trúc phức tạp nhất được quan sát; chỉ phù hợp khi yêu
cầu thực sự cần scale độc lập, Kafka, nhiều datastore và vòng đời model.

### 3.3. EProject commerce microservices

**Đường dẫn đại diện:** `D:\hoc\Node\EProject-Phase`

**Các bản sao được phát hiện:**

- `D:\hoc\Node\EProject-Phase\EProject-Phase`
- `D:\hoc\Node\22707991_NguyenTuanAnh_EProject\EProject-Phase`
- `D:\hoc\EProject-Phase-1\EProject-Phase-1\EProject-Phase-1`
- `D:\Downloads\EProject-Phase-1\EProject-Phase-1\EProject-Phase-1`

**Stack quan sát được:** Node.js, Express, MongoDB/Mongoose, RabbitMQ/AMQP, JWT,
HTTP proxy, Docker Compose, Mocha và Chai.

**Architecture quan sát được:**

- Microservices nhỏ gồm auth, product, order và API Gateway.
- API Gateway dùng HTTP proxy.
- RabbitMQ cho giao tiếp/event giữa service; MongoDB là persistence.
- Mỗi service có package/Dockerfile riêng và được ghép bằng Docker Compose.

**Bằng chứng chính:** `package.json`, `api-gateway/package.json`,
`auth/package.json`, `product/package.json`, `order/package.json`,
`docker-compose.yml`.

**Giá trị tham khảo:** Mẫu microservices tối giản hơn `project-cnm`, phù hợp để
tham khảo ranh giới service và gateway, nhưng không phải bằng chứng rằng tách
service luôn tốt hơn một backend duy nhất.

### 3.4. Product/user catalog management

**Đường dẫn:** `D:\hoc\Big Data\product-user-catalog-management-system`

**Stack quan sát được:**

- Frontend: React + Vite + Tailwind CSS + shadcn/Base UI, Axios, React Router.
- Backend: Node.js + Express.
- Data/auth: MongoDB + Mongoose, bcrypt và JWT.
- Gateway: Express HTTP proxy.

**Architecture quan sát được:** Frontend SPA + API Gateway + hai microservice
`member-service` và `product-service`. Mỗi service có model/controller/route riêng.

**Bằng chứng chính:** `README.md`, `frontend/package.json`,
`backend/api-gateway/index.js`, `backend/member-service`,
`backend/product-service`.

**Giá trị tham khảo:** Mẫu nhỏ, dễ hiểu cho SPA + gateway + service CRUD; mức độ
phức tạp thấp hơn hai hệ thống microservices ở trên.

### 3.5. PTUD school/attendance management family

**Đường dẫn đại diện:** `D:\hoc\PTUD\final\PTUDFinal`

**Các biến thể/bản sao:** `final1`, `pjfinal`, `prjEnd`, `prjnhom`, `PTUD` và
`PTUD - Copy` dưới `D:\hoc\PTUD`.

**Stack quan sát được ở bản đại diện:**

- Frontend: React + Vite, Radix UI, Tailwind utilities, React Hook Form, Recharts.
- Backend: Node.js + Express REST API.
- Data: MySQL qua `mysql2/promise`.
- Auth/files: JWT, bcrypt, Multer, Nodemailer.
- Test: Jest + Supertest.

**Architecture quan sát được:** Three-tier/modular monolith: React SPA, một
Express backend chia route/controller/module nghiệp vụ, và một relational
database. Không có bằng chứng cần broker hoặc nhiều independently deployed service.

**Biến thể:** `D:\hoc\PTUD\PTUD` có Express + MongoDB/Mongoose, cho thấy cùng kiểu
SPA/backend monolith nhưng dùng document database.

**Bằng chứng chính:** `frontend/package.json`, `backend/package.json`,
`backend/app.js`, `backend/src/config/db.js`.

**Giá trị tham khảo:** Mẫu gần nhất cho một đồ án full-stack có nhiều module nhưng
vẫn giữ deployment đơn giản.

### 3.6. GitNexus

**Đường dẫn:** `D:\hoc\Cong Nghe Moi\GitNexus`

**Stack quan sát được:**

- Monorepo TypeScript/Node.js.
- CLI/MCP: Commander, MCP SDK, Express, Tree-sitter native, Hugging Face
  Transformers, ONNX Runtime.
- Graph/data: LadybugDB, Graphology, clustering/index libraries.
- Web: React + Vite + Tailwind CSS, Sigma.js, D3, React Markdown.
- AI integration: LangChain adapters cho nhiều provider.
- Test/tooling: Vitest, Playwright, ESLint, Prettier, Husky, lint-staged.
- Evaluation: Python 3.11+, pytest, Ruff, Hypothesis, pandas, LiteLLM.
- Deployment option: Docker Compose cho server và web.

**Architecture quan sát được:** Monorepo gồm CLI/indexer, shared package, MCP/local
server, graph persistence và web visualization. Source code được parse thành
knowledge graph, sau đó phục vụ agent qua MCP hoặc UI.

**Bằng chứng chính:** `README.md`, `ARCHITECTURE.md`, `package.json`,
`gitnexus/package.json`, `gitnexus-web/package.json`, `eval/pyproject.toml`,
`docker-compose.yaml`.

**Giá trị tham khảo:** Mẫu cho developer tool, local-first processing, MCP và
knowledge graph; không phải mẫu trực tiếp cho booking platform.

## 4. Các họ dự án nhỏ và bài lab

### 4.1. Node.js authentication và CRUD

**Đường dẫn tiêu biểu:**

- `C:\Users\firet\NodeJS-Authentication-System`
- `D:\hoc\Node\NodeJS-Authentication-System`
- `D:\hoc\Node\local_passport_auth_service`
- `D:\hoc\Node\local_passport_website`
- `D:\hoc\Node\cookie_session_auth`
- `D:\hoc\Node\simple_auth`
- `D:\hoc\Node\token_auth`
- `D:\hoc\Node\lab03\nodemvclab`
- `D:\hoc\Node\lab04\drug-monitor`
- `D:\hoc\Node\lab05\node-mvc-crud-product-supplier`
- `D:\hoc\Node\22707991_NguyenTuanAnh_lab5_p2`
- `D:\hoc\Node\22707991_NguyenTuanAnh_Part3`

**Stack chung:** Node.js, Express, MongoDB/Mongoose, EJS, bcrypt, session,
Passport Local/Google OAuth hoặc JWT; một số project có Swagger, Axios và MVC
folder structure.

**Architecture chung:** Server-rendered Express MVC hoặc REST monolith nhỏ. Đây
là nguồn tham khảo tốt cho auth/CRUD cơ bản, không phải cho distributed system.

### 4.2. React/Vite labs

**Đường dẫn tiêu biểu:**

- `D:\hoc\Big Data\Lab1\my-react-app`
- `D:\hoc\Big Data\Tuan2\my-app`
- `D:\hoc\Big Data\Demo_Tuan2\demo`
- `D:\hoc\Big Data\Demo_Tuan3`

**Stack:** React, Vite, JavaScript/TypeScript, React Bootstrap ở một biến thể.

**Architecture:** Frontend-only SPA/demo; không có bằng chứng về backend hoặc
persistence chung cho cả họ.

### 4.3. HR attendance UI prototype

**Đường dẫn:** `D:\hoc\Quản lý dự án\chamcong`

**Stack:** React + Vite + TypeScript + Tailwind CSS, Material UI, Radix UI,
TanStack Table, Chart.js/Recharts, React Router, Axios và XLSX.

**Architecture quan sát được:** Frontend SPA với protected routes, auth context
và mock data. README mô tả API thật như một bước tích hợp tương lai; không có
bằng chứng backend hiện hữu trong project này.

### 4.4. Python/data-science labs

| Project | Stack/kiểu |
|---|---|
| `D:\hoc\GDDL\LAB\AIforTradingND_P01_Trading_with_Momentum-master` | Python data science/notebook: NumPy, pandas, SciPy, scikit-learn, CVXPY, Plotly |
| `D:\hoc\Big Data\Nhập môn dữ liệu lớn - K18-K19\LAB\LAB02\flask_app` | Flask web app tối giản |
| `D:\hoc\Big Data\Nhập môn dữ liệu lớn - K18-K19\LAB\LAB03\orchestration-workshop-mrnam\dockercoins` | Docker Compose workshop/multi-container demo |
| Các notebook trong `D:\Downloads` | Jupyter/Python coursework; không xác lập một application architecture chung |

### 4.5. Static web coursework

**Đường dẫn:** `D:\DulieuWeb`

**Stack:** HTML, CSS, JavaScript, Bootstrap, jQuery và static assets.

**Architecture:** Static multi-page websites/bài lab, không có build system hoặc
backend được xác lập.

### 4.6. SQL Server coursework

**Đường dẫn:** `D:\22707991_NguyenTuanAnh`

**Stack:** T-SQL/SQL Server (`CREATE DATABASE`, `IDENTITY`, `NVARCHAR`, schema
`dbo`) cho các bài quản lý bán hàng, phim và dự án.

**Architecture:** Relational database exercises; không có application layer.

### 4.7. WordPress commerce site

**Đường dẫn:** `D:\xampp\htdocs\tmdt\wordpress`

**Stack quan sát được:** WordPress 6.8, PHP, Apache/XAMPP, MySQL-compatible
database, WooCommerce, Elementor, Jetpack, Yoast SEO, cache/backup/migration
plugins.

**Architecture:** Traditional PHP CMS/plugin monolith chạy trong XAMPP. Đây là
mẫu content/e-commerce plugin ecosystem, không phải SPA/microservices.

## 5. Workspace không xác lập application stack

| Workspace | Kết luận quan sát được |
|---|---|
| `D:\Khoaluantn` | Documentation/BA/orchestration workspace cho nền tảng cầu lông; chưa có runnable application manifest hoặc stack implementation được duyệt |
| `D:\BA` | Bộ tài nguyên/skill BA và template; không phải application production |
| `D:\VE BPMN` | Workspace mô hình nghiệp vụ và database artifact; có Python/Node helper nhưng không phải application stack |
| `D:\CAB-BOOKING` | Chỉ phát hiện tài liệu PDF, không có source để xác minh stack |
| `D:\KLTN` | Chỉ phát hiện tài liệu nghiên cứu PDF |
| `D:\acphanquyennguoidung` | Tài liệu và model Visual Paradigm, không có source application |
| `C:\Users\firet\OneDrive\Documents\Playground` | Git repository nhưng không phát hiện source/manifest tại thời điểm quét |

## 6. Các pattern kiến trúc đã thực sự xuất hiện

| Pattern | Project bằng chứng | Khi Claude có thể xem xét |
|---|---|---|
| Static/multi-page web | `D:\DulieuWeb` | Trang giới thiệu hoặc bài tập không cần state server |
| Server-rendered MVC monolith | Node auth/CRUD labs | CRUD/auth nhỏ, EJS, deployment một process |
| SPA + REST modular monolith | PTUD family | Đồ án nhiều module cần đơn giản hóa vận hành |
| SPA + API Gateway + vài service | Product/user catalog, EProject | Domain boundary rõ nhưng quy mô service còn nhỏ |
| Event-driven microservices | `project-cnm` | Booking/payment/notification cần async workflow và service độc lập |
| Kafka/polyglot microservices | CAB system | Realtime/high-throughput, ML service, nhiều datastore có lý do rõ |
| CMS/plugin monolith | WordPress site | Content/e-commerce phù hợp hệ sinh thái plugin |
| Local-first CLI + MCP + graph | GitNexus | Developer tooling, code intelligence và agent integration |

## 7. Hướng dẫn Claude sử dụng inventory

1. Dùng tài liệu này để tạo **candidate stack**, không dùng nó như quyết định cuối.
2. Trước khi chọn tech cho `D:\Khoaluantn`, đối chiếu `docs/DISCOVERY_PROMPT.md`,
   `docs/REPORT_SPEC.md`, product requirements và constraint triển khai.
3. Ưu tiên kiến trúc đơn giản nhất đáp ứng tiêu chí đồ án; chỉ thêm gateway,
   broker, cache hoặc tách service khi có requirement và cách kiểm chứng cụ thể.
4. Không tính các bản sao EProject/PTUD/CAB là nhiều lần xác nhận độc lập.
5. Không kết luận PostgreSQL tốt hơn MongoDB, RabbitMQ tốt hơn Kafka hoặc
   microservices tốt hơn monolith chỉ từ tần suất xuất hiện.
6. Khi đề xuất stack, Claude phải ghi rõ:
   - requirement nào dẫn đến lựa chọn;
   - project nào trên máy là bằng chứng tham khảo;
   - phần nào được tái sử dụng và phần nào bị loại;
   - chi phí vận hành, test và deployment;
   - tiêu chí thay đổi kiến trúc sau này.

## 8. Shortlist tham khảo cho `Khoaluantn` — chưa phải quyết định

| Nhu cầu cần chứng minh | Nguồn tham khảo gần nhất |
|---|---|
| Full-stack đơn giản, nhiều module | PTUD: React/Vite + Express + relational DB, modular monolith |
| Booking/payment/event workflow | `project-cnm`: PostgreSQL/Prisma + RabbitMQ + Redis + outbox |
| Realtime matching hoặc AI service độc lập | CAB system: Kafka + Redis + FastAPI/XGBoost |
| Auth/session/JWT cơ bản | Node authentication family |
| Dashboard quản trị | `chamcong`, PTUD và frontend `project-cnm` |
| API Gateway nhỏ | Product/user catalog hoặc EProject |

Mọi lựa chọn cho nền tảng cầu lông vẫn phải đi qua discovery và approval; inventory
này chỉ làm giảm chi phí tìm lại kinh nghiệm kỹ thuật đã có trên máy.
