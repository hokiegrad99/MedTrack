import csv
with open('test_expenses.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Date', 'Category', 'Provider', 'Description', 'Amount', 'Insurance Covered', 'Notes'])
    for i in range(1, 46):
        writer.writerow(['2026-01-01', 'Doctor Visit', f'Provider {i}', 'Description', '100', '0', ''])
