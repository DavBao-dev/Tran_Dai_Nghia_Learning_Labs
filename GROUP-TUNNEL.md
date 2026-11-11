# Chia sẻ Qwen cho nhóm qua Tunnel miễn phí

1. Cài Ollama, chạy bản local một lần để tạo model `tdn-qwen3-8b`.
2. Cài `cloudflared` từ Cloudflare, hoặc đặt `cloudflared.exe` trong thư mục `tdn-models/runtime` cạnh dự án.
3. Mở `Chay-AI-Nhom.cmd`, giữ máy bật và không sleep.
4. Mở `tdn-models/runtime/GROUP-ACCESS.txt`. Gửi riêng website, URL gateway và mã truy cập cho thành viên.
5. Trên website, vào **Môi trường thi → Chat AI → Cấu hình**, nhập gateway và mã, rồi kết nối.
6. Mở `Dung-AI-Nhom.cmd` để dừng. Launcher chỉ dừng các tiến trình do nó khởi tạo.

URL Tunnel thay đổi sau mỗi lần khởi động. Quick Tunnel dành cho dùng thử, không có cam kết uptime. Không cần mua tên miền. Weight vẫn nằm trên máy chủ local; thành viên không phải tải model.

Gateway chỉ cho phép `/api/chat` và `/api/health`, yêu cầu Bearer token. Không phục vụ file, notebook hoặc API quản lý Gallery. CORS cho website production và localhost. Giới hạn chung 12 lượt/phút, một lượt suy luận tại một thời điểm; khi GPU bận, thành viên sẽ được yêu cầu thử lại. Chế độ nhóm dùng phản hồi nhanh, tối đa 768 token, không bật thinking.

Mã nhóm lưu ngoài repo tại `tdn-models/runtime/group-key.txt`. Không đưa file này hoặc `GROUP-ACCESS.txt` lên GitHub. Muốn đổi mã: dừng Tunnel, xóa `group-key.txt`, khởi động lại và gửi mã mới cho nhóm. Mỗi lần tải lại trang, người dùng cần nhập lại mã vì giao diện chỉ giữ mã trong bộ nhớ.

Log riêng: `group-gateway.log`, `group-tunnel.log`, `group-ollama.log`. Nếu có lỗi khởi động, xem terminal và các log này. Notebook chạy Python trên Vercel vẫn chưa được hỗ trợ; TorchViz trong trình duyệt hoạt động độc lập.

Tài liệu: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
