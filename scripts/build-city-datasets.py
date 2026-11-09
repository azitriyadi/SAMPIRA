"""Build small public aggregates; keep manager names and bank addresses in raw CSV only."""
import csv
import hashlib
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(folder, expected_unit):
    path = next((ROOT / 'data/datasets' / folder).glob('*.csv'))
    rows = list(csv.DictReader(path.open(encoding='utf-8-sig', newline='')))
    assert rows and all(r['satuan'] == expected_unit for r in rows)
    assert all(r['bps_nama_kabupaten_kota'] == 'KOTA BANDUNG' for r in rows)
    assert len({r['id'] for r in rows}) == len(rows)
    return rows, {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'rows': len(rows)}


def series(rows, group, value):
    result = defaultdict(lambda: defaultdict(Decimal))
    for row in rows:
        number = Decimal(row[value])
        assert number.is_finite() and number >= 0
        result[row['tahun']][row[group]] += number
    return {year: {key: float(number) for key, number in values.items()} for year, values in sorted(result.items())}


production, p_source = load('produksi-sampah', 'TON/HARI')
handling, h_source = load('capaian-penanganan', 'TON')
assert all(sum(r['tahun'] == year for r in handling) == 12 for year in {r['tahun'] for r in handling})
data = {
    'production': {'years': series(production, 'jenis_sampah', 'produksi_sampah'), 'unit': 'ton/hari (CSV)', 'source': 'Dinas Lingkungan Hidup Kota Bandung', 'updated': '17 Juni 2026', 'scope': 'Kota Bandung', 'warning': 'Satuan CSV: TON/HARI; PDF metadata: m³/hari. Mengikuti CSV tanpa konversi; satuan perlu dikonfirmasi kepada produsen.', **p_source},
    'handling': {'years': series(handling, 'bulan', 'jumlah_sampah'), 'unit': 'ton', 'source': 'Dinas Lingkungan Hidup Kota Bandung', 'updated': '17 Juni 2026', 'scope': 'Kota Bandung', **h_source},
}
out = ROOT / 'assets/data/bandung-waste.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Built {out.name}: {out.stat().st_size} bytes; {len(production)}/{len(handling)} rows.')
