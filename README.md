# Lemon Creative · HTML / JSON → Figma

Plugin Figma nhập HTML hoặc JSON thành layer chỉnh sửa được. Giữ giao diện chọn file của plugin cũ; bổ sung dán nội dung, JSON adapter, màn hình responsive, component và Variables.

## Cài và chạy

1. Tải branch `feature/html-json-figma` về và giải nén.
2. Figma Desktop → Plugins → Development → Import plugin from manifest… → chọn `manifest.json`.
3. Chạy **Lemon Creative · HTML / JSON to Figma**.
4. Chọn HTML/JSON hoặc mở “Hoặc dán nội dung / ánh xạ JSON”.
5. Chọn chiều rộng chính và các chiều rộng bổ sung, rồi **Render và import vào Figma**.

`code.js`, `ui.html`, `manifest.json` đã sẵn sàng, không cần npm để cài plugin. Không chuyển sang plugin generative và không yêu cầu đổi form nhập liệu.

## Các dạng đầu vào

| Nguồn | Cách xử lý | Ví dụ |
|---|---|---|
| HTML + CSS | Render DOM ở từng viewport, đo kích thước/thứ tự/khoảng cách | `examples/responsive.html` |
| JSON snapshot | `root`, `rect`, `style`, `layout`, `children`; hỗ trợ `screens` | JSON từ `export-devtools.js` |
| JSON layer | `root` hoặc `nodes`, `type`, `width/height`, `layout`; `tokens` tùy chọn | `examples/scene.json` |
| JSON DOM | `tag`, `attributes`, `style`, `text`, `children`; render bằng trình duyệt | Có thể ánh xạ trường khác |
| JSON tùy biến | Chọn **JSON dạng DOM**, điền ánh xạ tên trường | `examples/custom-dom.json` |

Ánh xạ cho `custom-dom.json`:

```json
{"tag":"element","children":"items","text":"content","style":"css","attributes":"attributes"}
```

JSON nghiệp vụ, cây React, Figma REST response hoặc cấu trúc bất kỳ **không tự động có ý nghĩa bố cục**. Plugin báo lỗi nếu không nhận diện được, thay vì tạo một trang rỗng. Adapter JSON DOM nhận tên trường trực tiếp, chưa hỗ trợ đường dẫn lồng nhau như `props.children`. Giá trị CSS trong JSON DOM cần đơn vị như `"24px"` giống CSS thật.

## Auto Layout và responsive

- Flex → Auto Layout ngang/dọc; có order, reverse, wrap, gap, padding và alignment.
- Luồng block đơn giản → Auto Layout; khoảng cách đo từ DOM giữ cả margin đã gộp. Khung phụ `… / spacing` biểu diễn khoảng cách khác nhau giữa từng phần tử.
- Grid đều → Auto Layout ngang + Wrap. Grid có span/cột không đều giữ tọa độ và báo giới hạn; không giả vờ chuyển chính xác bằng cách chia hàng tùy ý.
- Phần tử absolute/fixed giữ vị trí absolute trong parent. Luồng inline/chồng lấn phức tạp được giữ vị trí tự do và có thông báo.
- Child có Fill/Hug/Fixed, min/max; chữ nhiều dòng được đo chiều rộng trước khi áp dụng Fill.
- HTML/JSON DOM mặc định xuất 1440, 768, 390 px. Mỗi màn hình được render riêng để CSS media query có tác dụng.
- JSON layer dùng kích thước và quy tắc được khai báo; nhiều bố cục breakpoint phải cung cấp trong `screens`.
- Figma không thực thi CSS media query khi kéo khung. Auto Layout co giãn bên trong một bố cục; đổi số cột/ẩn menu/đổi hướng theo breakpoint được thể hiện ở các màn hình riêng.

## Component

```html
<button data-figma-component="Button / Primary">Liên hệ</button>
<article data-figma-component="Card">...</article>
```

Hoặc JSON: `"component":"Button / Primary"`, hay `"type":"COMPONENT"` cùng `name`.

Thẻ HTML `button` tự nhận diện thành component. Các khối khác cần khai báo để không biến mọi div thành component.

Master được đặt trong khung **Components**, màn hình dùng instance. Chỉ dùng chung master khi cấu trúc, nội dung, kích thước và style khớp nhau. Hai khối cùng tên nhưng khác nội dung không bị gộp mất chữ/ảnh; tạo master riêng có hậu tố. Bản này chưa tạo variant set hoặc text property tự động.

## Design token

- Tạo Figma Variables và gắn vào màu fill/stroke, padding, gap, radius, font size.
- JSON hỗ trợ token đơn giản, `{value: ...}`, `{$value: ...}` và alias như `{color.brand}`. Alias được giải giá trị trước import; chưa giữ chuỗi alias thành Variable Alias giữa các token.
- Tham chiếu token trên layer được giữ đúng tên khi bind, kể cả hai token bằng giá trị.
- HTML đọc custom property từ `:root` cho màu HEX/RGB(A) và số/px. Các giá trị không có token được gom theo loại; không dùng chung token cỡ chữ cho khoảng cách chỉ vì cùng số.
- Có scope và CSS code syntax cho Variables. Mỗi lần nhập có collection riêng để không ghi đè design system sẵn có.
- Chưa hỗ trợ đầy đủ DTCG, theme modes, composite typography/shadow tokens, màu OKLCH/P3.

## Trang cần JavaScript / Tailwind CDN

Preview không chạy JavaScript trong nguồn HTML. Dùng HTML có CSS đã biên dịch, hoặc:

1. Mở trang thật trong Chrome; đợi trang và font tải xong.
2. Chạy nội dung `export-devtools.js` trong DevTools Console.
3. Script tải `figma-snapshot.json` và thử copy clipboard.
4. Chọn JSON đó trong plugin. Muốn nhiều breakpoint, xuất lại từng kích thước rồi gom các snapshot vào `{"screens":[...]}`.

Ảnh nhúng data URL dùng được; URL ảnh cần CORS cho phép khi export. File HTML có đường dẫn tài nguyên tương đối cần chuyển thành URL tuyệt đối/data URL hoặc export từ trang thật. Plugin hiện chưa có bộ chọn thư mục để tải kèm asset.

## Giới hạn cần biết

- Không cam kết chuyển mọi HTML/CSS hoặc mọi JSON giống pixel 100%.
- Background image/gradient, pseudo-element, layout bảng phức tạp, nhiều shadow, transform và rich text inline chưa được tái dựng đầy đủ. Có thông báo cho background/pseudo-element và layout không suy ra được.
- Font không có trong Figma được thay bằng Inter và báo tên font thiếu.
- Ảnh không tải được dùng placeholder và báo lỗi; JSON layer nên cung cấp `dataUrl`.
- JSON snapshot cũ bị ghi đè trường `text` không khôi phục được nội dung; cần export lại.
- Giới hạn 20 MB đầu vào, 20.000 node, 80 cấp; tối đa 6 viewport HTML hoặc 10 màn hình JSON.
- Nếu import lỗi, plugin xóa node và variable do chính lần import đó tạo, giữ nguyên thiết kế có sẵn.

## Phát triển và kiểm thử

```sh
npm run build
npm run check
npm test
```

Không có dependency lúc build. Sửa trong `src/`; `build.js` tạo lại `code.js`, `ui.html` và `export-devtools.js` từ cùng bộ chuẩn hóa/capture để tránh lệch hành vi.

Browser integration test (cần Playwright và Chromium):

```sh
node tests/browser.cjs
```

`tests/figma-fixture.cjs` xuất script dùng renderer hiện tại để chạy trong file Figma QA riêng. Không dùng script đó trên file production.

### Kết quả kiểm tra phiên này

- 11 test Node: chuẩn hóa schema, token alias, JSON mapping, xử lý dữ liệu sai, component, rollback khi font lỗi — đạt.
- Đã chạy renderer trong Figma thật: component reuse, 4 instance dùng 1 master, token màu khai báo được bind đúng, chữ xuống dòng khi khung từ 390 xuống 240 px — đạt và đã xem ảnh kết quả.
- Browser integration test đã viết nhưng **chưa chạy được**: môi trường không có Chromium, tải trình duyệt không thành công. Vì vậy chưa xác nhận độ chính xác của capture HTML trên các breakpoint bằng trình duyệt trong phiên này.
- Chưa chạy toàn bộ thao tác chọn file/import bên trong Figma Desktop; kiểm tra Figma ở trên là bộ dựng layer qua Plugin API.

File QA: https://www.figma.com/design/8vGF01PHEQVNNhkiwtnPUq

Tài liệu API tham khảo: https://developers.figma.com/docs/plugins/working-with-variables/ và https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/

Branch này độc lập, không merge vào `develop` hoặc `master`.
