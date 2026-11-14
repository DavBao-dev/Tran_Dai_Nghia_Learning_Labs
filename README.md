# THPT Chuyên Trần Đại Nghĩa · AI Workspace

## Tài khoản và Vừa Học Vừa Code · 14/11/2026

Đã thêm Google login qua Supabase, thành viên chờ admin duyệt, quản trị học liệu, cache IndexedDB theo tài khoản và đồng bộ code/tiến độ bằng RPC có kiểm tra revision/quota. Tab học dùng syllabus 305 buổi, phát Drive preview bên trái, editor Python/notebook và link Colab/Kaggle riêng bên phải. Không tải video về server. Dữ liệu Drive seed nằm ngoài repo; database áp dụng RLS, khách chưa đăng nhập không đọc được danh mục học riêng.

Xem [ACCOUNTS-SETUP.md](ACCOUNTS-SETUP.md) để cấu hình Google OAuth, database và admin đầu tiên. `npm test` kiểm thử PostgreSQL RLS, offline/conflict/account isolation và UI DOM; Google OAuth thật và tải hosted cần được kiểm tra sau khi cấu hình dịch vụ.

Ba khu vực: **Môi trường thi**, **Learning Lab**, **Learning Gallery**. Môi trường thi giữ bốn tab Code, Chat AI, Description, Submission – Ranking và dữ liệu đã lưu trước đó. Frontend HTML/CSS/JavaScript không cần build, kèm gateway Python gọi model trên Ollama.

## Learning Space · cập nhật 11/11/2026

- `dist/index.html`, `portal.js`, `portal.css`: giao diện ba khu vực; mặc định mở Gallery. Môi trường thi chuyển sang `dist/exam.html`, được mở trong iframe cùng origin để giữ localStorage và kernel như trước. Chỉ tạo iframe sau lần bấm tab thi đầu tiên, giữ phiên khi chuyển tab.
- Learning Lab dùng workspace 3D sao chép từ TorchViz-3D: editor, Visualize, xoay/zoom, chọn lớp và inspector. Source ở `torchviz-source`, bản build ở `dist/torchviz`. Python/WASM chạy trong Web Worker với torchstub để mô phỏng shape/đồ thị, không huấn luyện PyTorch thật. Chỉ tải khi mở Lab; khi rời tab hoặc ẩn trang, lưu code/shape rồi gỡ iframe và dừng worker. Canvas DPR=1, render theo yêu cầu trừ lúc chạy animation.
- `dist/learning/lab.js`: ba thử nghiệm nhẹ bổ sung (shape, gradient descent, convolution), chỉ tải khi mở mục **Thử nghiệm nhanh**.
- Gallery chứa đủ 17 tài liệu gốc từ ZIP VAIO2026. Tệp giữ nguyên bytes và SHA256; metadata ở `learning/catalog.json`. Danh mục khoảng 7 KB; mỗi trang tối đa 9 thẻ. PDF/HTML chỉ tải khi người học mở. HTML mở trong iframe sandbox không có quyền same-origin; đóng cửa sổ đọc sẽ gỡ iframe và giải phóng Blob URL. Một số bài gốc dùng CDN cho font/MathJax, cần Internet để hiển thị đầy đủ các phần đó.
- Người quản lý dùng **Thêm tài liệu** trên bản local để tải HTML/PDF/MD/TXT, tối đa 12 MB/tệp, tối đa 500 tệp bổ sung. Tệp và metadata lưu tại `../tdn-models/learning-gallery`, không nhét file vào localStorage. Có thể xóa tài liệu bổ sung; 17 bản VAIO gốc giữ nguyên.
- Đây là quyền quản lý trên máy local, chưa phải hệ thống tài khoản/phân quyền admin cho website public. API từ chối origin/host bên ngoài; nếu đặt `AI_GATEWAY_KEY`, nhập mã trong biểu mẫu quản lý. Khi triển khai nhiều người dùng cần bổ sung đăng nhập và kiểm tra quyền phía server.
- Launcher chọn backend có `learning_version=1`; URL có `gatewayPort` để nối đúng backend mới khi cổng cũ đang chạy. Hãy dùng URL launcher in ra, giữ origin cũ để thấy dữ liệu notebook trước đây.

Kiểm tra: phép tính Lab, luồng HTTP thêm/đọc/xóa tài liệu, giới hạn định dạng, từ chối origin ngoài, checksum 17 bản gốc; workspace 3D qua TypeScript/build và chạy LeNet/Mini ResNet bằng WASM đóng gói tới graph/layout. Gallery không tải runtime 3D; lần đầu mở Lab sẽ tải Three.js, editor và Python/WASM. Chưa xác minh trực quan bằng công cụ trình duyệt do công cụ timeout; chưa đo FPS trên máy người dùng.

## Chạy bản đầy đủ trên Windows

Cần Python 3.10+ và Ollama đã cài. Đặt thư mục weight tdn-models cạnh thư mục mã nguồn tdn-ai. File cần có: Qwen3-8B-Q4_K_M.gguf (5.027.783.488 byte).

Từ thư mục dự án, chạy:

```powershell
.\start-local.ps1
```

Mở http://127.0.0.1:5173. Script khởi động Ollama riêng tại cổng 11435, import GGUF thành tdn-qwen3-8b, rồi chạy gateway cùng frontend tại cổng 5173. Ctrl+C để dừng các tiến trình do script tạo. Model store ở tdn-models/ollama có thể chiếm thêm 5 GB. Tùy chọn -ModelDirectory 'D:/models' để đổi thư mục weight.

Nếu chưa có weight:

```powershell
python -m pip install huggingface_hub
python backend/download-model.py
```

Script tải đúng một file GGUF từ revision đã khóa của kho Qwen chính thức, rồi xác minh SHA-256.

## Model cho GPU khoảng 10 GB VRAM

Mặc định: Qwen/Qwen3-8B-GGUF, Q4_K_M. Weight khoảng 5,03 GB; khác với bộ nhớ lúc inference. Cấu hình khởi đầu: context 4096 token, một lượt xử lý đồng thời, KV cache Q8, tối đa 768 token đầu ra, tắt thinking. Ollama giữ model nóng 5 phút sau lượt chat.

Đã thử trên RTX 4060 Laptop 8 GB qua gateway: trả lời tiếng Việt thành công, lượt đầu khoảng 11 giây gồm nạp model; Ollama báo size_vram khoảng 5,1 GB. Con số này là cấp phát model do Ollama báo, không phải tổng VRAM của hệ điều hành. Tăng context, số lượt đồng thời hoặc thay runtime sẽ thay đổi nhu cầu bộ nhớ. Một GPU 10 GB cần hàng đợi hoặc thêm worker nếu cả lớp dùng đồng thời.

Nguồn: https://huggingface.co/Qwen/Qwen3-8B-GGUF/blob/main/Qwen3-8B-Q4_K_M.gguf
Hướng dẫn Qwen: https://qwen.readthedocs.io/en/latest/run_locally/llama.cpp.html

## Nhiều bài toán

- Có 5 bài: cảm xúc tiếng Việt, tin nhắn rác, Iris, hồi quy giá nhà và dự báo bán hàng.
- Dữ liệu đi kèm là mẫu nhỏ. Giá nhà/bán hàng là dữ liệu giả lập, chưa dùng làm đề thi chính thức.
- Chọn đề ở sidebar hoặc danh sách có tìm kiếm/lọc. Mỗi đề có tệp, chat và lịch sử bài nộp riêng.
- Thêm đề JSON: mở danh sách, tải Mẫu đề, sửa rồi Nhập đề JSON. ID mới bắt đầu bằng custom-.
- Kiểm tra CSV theo cột mục tiêu và nhãn/ràng buộc số của từng đề. Chưa có máy chấm và bảng xếp hạng thật.
- Bài làm tự lưu trên trình duyệt. Tải dự án xuất ZIP chứa tệp và lịch sử của bài đang mở; không chứa weight.
- Notebook hỗ trợ chạy các ô Python trên máy local; bản online chỉ soạn thảo và xuất notebook.

## Web online và Vercel

Frontend deploy tĩnh: Framework Other, không Build Command, Output Directory dist. Sites/Vercel không chạy model GPU.

Frontend gọi POST /api/chat, không còn phản hồi giả. Bản online cần gateway HTTPS ở server GPU. Mở Cấu hình AI để nhập URL, ví dụ https://gpu.example.com/api/chat. Mã gateway chỉ giữ trong bộ nhớ tab, không lưu vào localStorage hoặc source. Không nhập API key nhà cung cấp vào frontend.

backend/gateway.py phục vụ frontend local và gọi Ollama. Để đưa lên server riêng:

1. Import model vào Ollama; đặt OLLAMA_URL và OLLAMA_MODEL đúng với server đó.
2. Đặt AI_GATEWAY_KEY đủ mạnh; bắt buộc khi bind ra mạng.
3. Đặt AI_ALLOWED_ORIGINS gồm các origin được phép, phân tách bằng dấu phẩy. Mặc định có localhost và URL web TĐN.
4. Chạy python backend/gateway.py --host 0.0.0.0 --port 5173 sau reverse proxy HTTPS. Giữ Ollama trên loopback.

Gateway giới hạn request 64 KB, role user/assistant, kiểm tra origin/mã gateway và nhận một lượt inference cùng lúc. Ngữ cảnh được rút gọn để vừa context 4K. Frontend nhận tệp đính kèm tối đa 12.000 ký tự; gateway gửi tối đa 4.500 ký tự đầu, có thể rút gọn thêm theo lịch sử. Dữ liệu chat chỉ gửi đến gateway người dùng cấu hình.

Để dùng nhiều học sinh, cần bổ sung đăng nhập, lưu trữ server, rate limit theo người dùng, hàng đợi, máy chấm và sandbox code. Chưa tạo server GPU cloud hoặc chi phí thuê dịch vụ nào.

## Nhận diện

Logo dist/logo.svg là biểu trưng TĐN tạm, không phải logo chính thức. Phông Be Vietnam Pro và JetBrains Mono tải từ Google Fonts, có phông dự phòng.

## Giao diện tối giản

Bỏ font tải ngoài, banner, hiệu ứng và các khối trang trí. Chỉ hiện cây thư mục trong Code; chat dùng toàn chiều rộng. Description, danh sách đề và lịch sử bài nộp chỉ dựng khi mở. Chat hiển thị 40 tin gần nhất, có nút xem tin cũ, và chỉ thêm node mới. Số dòng editor chỉ vẽ vùng đang thấy; lưu khi ngừng gõ và trình duyệt rảnh. Không thay giao thức API hoặc cấu hình model.

## Khởi động local một lần nhấp

Mở Chay-AI-Local.cmd trong thư mục dự án, hoặc chạy python run-local.py. Launcher khởi động Ollama và gateway, kiểm tra model đã sẵn sàng rồi mở trình duyệt tại http://127.0.0.1:5173. Giữ cửa sổ launcher mở, Ctrl+C để dừng. Không dùng địa chỉ chatgpt.site để gọi GPU local. Không cần nhập URL gateway khi giao diện và backend cùng chạy local.

Bản online giờ kiểm tra kết nối gateway trước khi cho gửi chat. Nếu chưa cấu hình gateway, câu hỏi được giữ trong ô nhập và không gửi POST vào host tĩnh; nút Kết nối AI mở cấu hình. Cấu hình chỉ được lưu sau khi /api/health xác nhận model sẵn sàng.


## Notebook, nền tối và đề Markdown

- Mặc định mở notebook.ipynb, được tạo từ baseline.py; khi nâng cấp vẫn giữ code, chat và bài nộp cũ.
- Mỗi ô Code/Markdown có thể thêm, xóa và đổi thứ tự. Shift+Enter chạy ô; Chạy tất cả dừng khi gặp lỗi. Tải .ipynb mở được trong Jupyter.
- Các ô giữ biến trong một tiến trình Python riêng cho từng bài toán. Reset kernel xóa các biến. Tối đa 3 kernel tồn tại; kernel ít dùng được đóng khi mở bài thứ tư. Mỗi ô giới hạn 120 giây.
- Có stdout, stderr, giá trị biểu thức cuối, traceback và biểu đồ Matplotlib PNG. Đây là Python cell runner cơ bản, không hỗ trợ đầy đủ giao thức Jupyter, IPython magic, input tương tác, widget hoặc top-level await.
- **Chỉ thực thi code bạn tin cậy:** kernel chạy Python trực tiếp với quyền của ứng dụng trên máy bạn, không phải sandbox. API chạy notebook chỉ nhận kết nối loopback và origin localhost; không mở chạy code qua bản online.
- Đề gốc ở dist/problems/<id>/description.md. Tab Description tải file này vào workspace, hiển thị Markdown đã escape HTML, và có nút Sửa Markdown/Tải .md. Khi chỉnh sửa, phiên bản workspace được lưu và dùng làm ngữ cảnh chat; không bị ghi đè khi tải lại.
- Tệp .py vẫn có trình soạn thảo với tô màu cú pháp và nút Mở dạng notebook.
- Nền tối, font hệ thống và tokenizer/renderer nhỏ nằm trong source; không tải editor hoặc font ngoài.

**Sau khi cập nhật:** đóng launcher local cũ bằng Ctrl+C, mở lại Chay-AI-Local.cmd rồi refresh trình duyệt để nạp API notebook mới. Chạy notebook không cần model AI online; chỉ cần Python và các thư viện của bài toán.


## Tự xử lý backend notebook cũ (notebook-r2)

Log 404 cho /api/notebook/execute nghĩa là giao diện mới đang nói chuyện với một tiến trình backend cũ. Launcher mới tự chọn cổng trống trong 10 cổng tiếp theo, kiểm tra thực thi Python 6 * 7 = 42 rồi mới báo sẵn sàng. Frontend tự tìm đúng kernel bằng /api/notebook/health; không gửi POST vào endpoint cũ nữa.

Nếu server cũ đang phục vụ cùng thư mục mã nguồn, launcher giữ nguyên origin của giao diện để giữ localStorage/bài làm và chạy backend notebook mới ở cổng khác. CORS chỉ cho các origin localhost của hai cổng. Nút chạy báo lỗi kết nối ngay trong ô, giữ lại nội dung lỗi thay vì chỉ hiện toast.

Mở lại Chay-AI-Local.cmd bản mới; launcher tự mở URL có cache-busting. Không cần đóng hoặc tìm PID của server cũ. Khi chỉ cần notebook, dùng python run-local.py --notebook-only; không cần Ollama hoặc weight để chạy Python.


## Gợi ý code tùy chọn

Công tắc Gợi ý code ở thanh phía trên editor, dùng chung cho tệp .py và các ô Code của notebook. Mặc định tắt; trạng thái được nhớ trên trình duyệt. Khi tắt, không tải chỉ mục và không gọi backend/model.

Khi bật: gõ nn. để tìm thành phần thư viện, nn.Linear( hoặc nn.Linear() để xem chữ ký hàm và chọn in_features=, out_features=, bias=, device=, dtype=. Mũi tên chọn, Tab/Enter chèn, Esc đóng, Ctrl+Space mở lại. Shift+Enter vẫn chạy ô. Dấu ngoặc được ghép đôi khi chế độ bật. Ô Markdown/Raw không bật gợi ý Python.

Chỉ mục chữ ký lấy từ thư viện Python đã cài khi build, gồm các thành phần phổ biến của PyTorch, NumPy, pandas và scikit-learn. Có nhận alias import và một số biến khởi tạo từ lớp. Đây là gợi ý theo chữ ký/chỉ mục, chưa phải máy phân tích kiểu Python đầy đủ. Các hàm C hoặc extension không công bố chữ ký có thể chỉ gợi ý tên. Chạy python backend/build-code-assist.py để cập nhật sau khi đổi phiên bản thư viện.

Thay đổi này chỉ ở frontend; refresh trình duyệt để nhận công tắc mới, không cần khởi động lại launcher.
