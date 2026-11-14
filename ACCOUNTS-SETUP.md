# Cài tài khoản và database

Mã nguồn đã sẵn sàng; Google login và lưu cloud chỉ hoạt động sau khi cấu hình dịch vụ thật. Gallery và TorchViz vẫn dùng được khi cloud-config trống. Không nhập service_role, secret key hay mật khẩu database vào frontend.

## 1. Supabase miễn phí

Tạo project trong https://supabase.com/dashboard, chọn khu vực Singapore và gói Free. Chủ tài khoản tự đặt mật khẩu database. Trong SQL Editor chạy `supabase/migrations/001_learning.sql` một lần trên project mới.

Chạy `python tools/create-seed.py` trên máy có thư mục private-seed đã nhập. Sau đó chạy `private-seed/002_seed.sql` trong SQL Editor để nhập 305 buổi syllabus và toàn bộ danh mục tài liệu. Cả seed và metadata Drive nằm ngoài Git và ngoài thư mục dist.

## 2. Google OAuth

Tạo Google Cloud project tại https://console.cloud.google.com/, cấu hình OAuth consent cho ứng dụng web và tạo OAuth client. Cho phép redirect URI `https://PROJECT_REF.supabase.co/auth/v1/callback` theo URL Supabase hiển thị. Nếu Google app còn ở chế độ Testing, thêm thành viên nhóm vào danh sách test users.

Trong Supabase Authentication → Providers → Google, bật Google và nhập client ID/secret tại dashboard; secret không đưa vào repo. Authentication → URL Configuration: Site URL là `https://tran-dai-nghia-learning-labs.vercel.app`; thêm đúng URL production và URL preview cần dùng vào Redirect URLs. Chỉ yêu cầu quyền Google đăng nhập cơ bản, không yêu cầu quyền Drive của học sinh.

## 3. Kết nối frontend và admin

Điền Project URL và publishable/anon key vào `dist/cloud-config.json`. Đây là hai giá trị công khai; quyền truy cập do RLS bảo vệ. Commit và deploy lại. Đăng nhập lần đầu bằng `davidtuber710@gmail.com`, sau đó chạy trong SQL Editor:

```sql
update public.members set role='admin',status='active'
where email='davidtuber710@gmail.com';
```

Kiểm tra chỉ một hàng được cập nhật. Tải lại web. Từ nút tài khoản mở quản trị để duyệt thành viên, nhập lại JSON danh mục, sửa số buổi, thêm hoặc ẩn tài liệu. Không cấp quyền admin bằng giao diện học sinh.

## 4. Lưu dữ liệu và quyền Drive

Code/notebook/ghi chú/link riêng/đánh dấu hoàn thành được lưu theo người dùng. Chat và lịch sử bài nộp không gửi lên cloud. Dataset mẫu không nhân bản; thay đổi của người học được lưu dưới dạng patch. Notebook cloud loại bỏ output và attachments. Giới hạn database: 1 MiB/bài, 10 MiB/tài khoản.

Browser lưu bản nháp theo ID tài khoản, gửi sau khoảng hai giây ngừng sửa. Khi mất mạng, giữ bản máy và thử lại khi online; có nút Lưu ngay. Bản xung đột được sao lưu cục bộ trước khi chọn giữ bản máy hoặc cloud. Khi đổi thiết bị, mở cùng buổi/bài để lấy dữ liệu. Không có đồng bộ realtime; tải lại bài để đọc thay đổi mới ở máy khác.

Đăng nhập ứng dụng không cấp quyền Drive. Người học vẫn cần tài khoản Google được chủ Drive chia sẻ; nếu preview không mở, dùng Mở trên Drive. Không tự đo thời lượng xem video trong iframe; tiến độ là đánh dấu hoàn thành thủ công.

Colab/Kaggle mở ở tab ngoài. Xuất/nhập `.ipynb` để chuyển code; không tự đồng bộ nội dung notebook ở dịch vụ ngoài. Qwen Tunnel không phụ thuộc database này và vẫn cần máy chủ đang bật.

## 5. Kiểm thử và vận hành

`npm ci`, `npm run build:cloud`, `npm run test:db`, `node tests/sync.mjs`, `node tests/study-dom.mjs` (DOM test cần happy-dom dev dependency).

Trước khi mở cho nhóm: thử Google OAuth thật, admin duyệt/khóa, hai tài khoản, hai thiết bị và quyền xem Drive. Kiểm thử local không thay thế đo tải hosted 20 người. Free project có thể bị pause do ít hoạt động; theo dõi database/egress trên dashboard, không tạo polling để tránh pause.

Lập danh mục thủ công khi Drive đổi: cung cấp token Drive ngắn hạn trong môi trường local, chạy `python tools/index-drive.py`, rồi admin nhập JSON kết quả. Không gọi Google Drive API trong lúc học sinh duyệt bài. Nguồn syllabus chỉ đọc, không sửa ô Check của chủ sheet.
