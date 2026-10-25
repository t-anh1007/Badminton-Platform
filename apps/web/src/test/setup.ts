import '@testing-library/jest-dom/vitest'

// jsdom không có object URL; component xem trước ảnh cần hai hàm này. Test nào cần kiểm tra thì tự stub đè.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = () => {}
}
