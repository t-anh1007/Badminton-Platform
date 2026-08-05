export interface AdminTableColumn<T> {
  key: keyof T;
  label: string;
  /** Cột số liệu (tiền, id) hiển thị bằng Geist Mono. */
  numeric?: boolean;
}

/**
 * Table Admin — baseline dùng chung cho các màn quản trị (duyệt NCC, rút
 * tiền, tranh chấp — ACC-08/VEN-02/FIN-11/FIN-13). Dữ liệu là mock ở Gdesign.
 */
export function AdminTable<T extends { id: string | number }>({
  columns,
  rows,
  emptyLabel = 'Không có dữ liệu',
}: {
  columns: AdminTableColumn<T>[];
  rows: T[];
  emptyLabel?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-bg-white shadow-sm">
      <table className="w-full min-w-[560px] text-left text-body">
        <thead>
          <tr className="border-b border-slate/10">
            {columns.map((col) => (
              <th key={String(col.key)} className="text-caption px-4 py-3">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-text-primary/60">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-slate/5 last:border-0">
                {columns.map((col) => (
                  <td key={String(col.key)} className={`px-4 py-3 ${col.numeric ? 'text-figures' : ''}`}>
                    {String(row[col.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
