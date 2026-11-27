CÁCH ĐƯA TRANG LÊN MẠNG (GitHub + Netlify), khoảng 10 phút

1. GitHub
   - Tạo một repository mới (nên để Private).
   - Bấm "Add file" -> "Upload files", kéo TOÀN BỘ nội dung thư mục này vào
     (thư mục public, thư mục netlify, file netlify.toml, file package.json) rồi Commit.

2. Netlify
   - Vào netlify.com -> "Add new site" -> "Import an existing project" -> chọn GitHub -> chọn repository vừa tạo.
   - Không cần sửa gì ở phần Build settings (đã có sẵn trong netlify.toml). Bấm Deploy.

3. Đặt mật khẩu tạm (BẮT BUỘC)
   - Netlify -> Site configuration -> Environment variables -> Add a variable
     Tên: INITIAL_PASSWORD    Giá trị: một mật khẩu tạm bạn tự chọn (ít nhất 6 ký tự)
   - Sau đó vào Deploys -> Trigger deploy -> "Deploy site" để trang nhận mật khẩu.

4. Dùng
   - Mở địa chỉ Netlify của bạn. Tên đăng nhập: chauanh, bichngoc, thuyduong, thuydung.
   - Lần đầu mỗi bạn dùng mật khẩu tạm ở bước 3, trang sẽ bắt đổi sang mật khẩu riêng.
   - Quên mật khẩu: Châu Anh vào Tài khoản -> "Đặt lại mật khẩu".

Dữ liệu (tiến độ, bình luận, thông báo) được lưu bằng Netlify Blobs, không cần tạo cơ sở dữ liệu nào khác.
Muốn xem thử trên máy mà chưa có backend: mở file public/index.html bằng trình duyệt (chế độ thử, mật khẩu demo).
