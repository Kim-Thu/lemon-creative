# HTML → Figma structured importer

Mục tiêu của branch này là chuyển HTML đã render trong Chrome sang Figma nhưng vẫn giữ hierarchy và Auto Layout thay vì flatten thành SVG.

## Luồng sử dụng

1. Mở website cần chuyển trong Chrome.
2. Mở DevTools → Console.
3. Chạy `export-devtools.js`.
4. Script xuất JSON và đồng thời copy JSON vào clipboard.
5. Trong Figma Desktop: Plugins → Development → Import plugin from manifest.
6. Chọn `manifest.json`.
7. Chạy plugin `Structured HTML → Figma`.
8. Dán JSON vào UI và bấm Import.

## Mapping layout

- `display:flex` → Figma Auto Layout ngang/dọc.
- `flex-wrap` → Auto Layout Wrap.
- `gap` → item spacing.
- `padding` → padding của frame.
- `justify-content` / `align-items` → alignment.
- CSS Grid → Auto Layout ngang + Wrap gần đúng.
- Container không phải flex/grid → frame thường, giữ vị trí tương đối theo DOM.

## File

- `export-devtools.js`: chạy trực tiếp trong Chrome DevTools.
- `manifest.json`: manifest cho plugin Figma.
- `code.js`: dựng node Figma và Auto Layout.
- `ui.html`: UI để dán JSON/import.

Branch này không cập nhật vào develop.