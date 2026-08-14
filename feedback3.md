### 1. 🏗️ Hiển thị & Cấu trúc Bảng (Rendering & Layout)

  • DOM Native Table: Sử dụng bảng HTML chuẩn <table>/<thead>/<tbody> (không vẽ trên     
  Canvas ECharts) giúp tối ưu hiệu năng cuộn và hỗ trợ CSS linh hoạt.
  • Sticky Header: Cố định tiêu đề bảng khi cuộn dọc (position: sticky; top: 0).
  • Tùy chỉnh Chiều cao & Auto Height:
      • auto_height: true: Tự động co giãn theo số dòng, không giới hạn chiều cao        
      (overflow-y: visible).
      • height: N px: Cố định chiều cao thẻ card bảng kèm thanh cuộn riêng.
  • Mật độ dòng (Row Density):
      • compact: Khoảng cách hẹp (4px 8px).
      • normal: Tiêu chuẩn (8px 12px).
      • relaxed: Khoảng cách rộng thoáng (12px 16px).
  • Kiểu hiển thị (Table Variants): Hỗ trợ dạng bordered (có viền ô), striped (dòng      
  ngựa vằn xen kẽ màu) hoặc default.
  • Ngắt dòng (Text Wrap): Cho phép ngắt dòng (text_wrap: true) hoặc cố định 1 dòng      
  (white-space: nowrap).
  • Căn lề tự động (Smart Alignment): Tự động căn giữa STT/Date, căn phải số/tiền        
  tệ/phần trăm, căn trái chữ.
  • Tùy chỉnh cỡ chữ (Font Size): Tự do chỉnh kích thước font (px) cho từng bảng.        
  ──────
  ### 2. 🔀 Sắp xếp dữ liệu (Sorting)

  • Sắp xếp trực tiếp trên Header: Click vào tiêu đề cột <th> để đổi chiều sort: Tăng    
  dần (▲) / Giảm dần (▼) / Mặc định (↕).
  • So sánh đa kiểu dữ liệu (Multi-type Natural Sort):
      • Số: Tự động loại bỏ dấu phân cách và so sánh giá trị số.
      • Ngày tháng: So sánh theo mốc thời gian thực (hỗ trợ nhiều format).
      • Chữ tiếng Việt: So sánh tự nhiên chuẩn tiếng Việt qua localeCompare('vi', {      
      numeric: true, sensitivity: 'base' }).

  ──────
  ### 3. 📄 Phân trang & Tìm kiếm (Pagination & Search)

  • Phân trang Client-Side:
      • Tùy chọn số dòng mỗi trang (page_size): 10, 20, 25, 50, 100 dòng...
      • Bộ nút chuyển trang (‹ Trước, các trang 1, 2, 3..., Sau ›).
      • Dòng trạng thái: Hiển thị start - end trên tổng total dòng.
  • Tìm kiếm nhanh trong bảng: Ô input 🔍 Tìm kiếm... realtime, lọc dữ liệu tức thì      
  trên tất cả các cột của bảng (xài hàm utils)
  ──────
  ### 4. 🔢 Định dạng Cột (Column Formats - col_formats)

  • auto: Tự động nhận diện kiểu.
  • number_comma: Phân cách hàng nghìn kiểu Mỹ (vd: 1,234,567).
  • number_vn: Rút gọn số kiểu Việt Nam (vd: 1.5 Tr, 2.3 Tỷ, 150 K).
  • currency: Tiền tệ VNĐ có ký hiệu ₫ (vd: 1,250,000 ₫).
  • percent: Tỷ lệ phần trăm (vd: 15.5%, 98.2%).
  • date / date_ddmmyyyy_hhmmss / date_yymmdd / date_mmyyyy / date_yyyy: Đa dạng định    
  dạng ngày giờ.
  • badge: Định dạng thẻ badge bo tròn cho mã code/trạng thái.
  • monospace: Font lập trình JetBrains Mono cho mã SKU, đơn hàng.
  • Tự động sinh cột STT: Cột stt tự động đánh số thứ tự từ 1 đến N theo trang.
  ──────
  ### 5. 🎨 Tô màu có điều kiện (Conditional Formatting & Colors)

  • pos_green_neg_red: Số dương nền xanh + chữ xanh, số âm nền đỏ + chữ đỏ.
  • status_badge: Tự động nhận diện từ khóa trạng thái (Hoàn thành/Đạt -> Xanh;
  Hủy/Lỗi/Thất bại -> Đỏ; Chờ/Đang xử lý -> Vàng).
  • Màu cố định: green, red, amber, cyan.
  • Quy tắc điều kiện tùy biến (conditional_rules): Cấu hình toán tử >=, <=, >, <, ==,   
  !=, contains, startsWith để tự do chọn màu chữ, màu nền, in đậm (bold).
  ──────
  ### 6. ⚙️ Modal Tùy chỉnh Cột Bảng (Table Column Modal)

  • Giao diện Popup lớn (95vw, max 1280px, 90vh) cho phép:
      • Ẩn / Hiện cột bất kỳ.
      • Đổi tên hiển thị (Label) của cột.
      • Kéo thả đổi thứ tự cột.
      • Gán nhóm Super Header Group.
      • Chọn Format & Màu sắc cho từng cột.
      • Lưu cấu hình riêng của từng User vào localStorage theo namespace