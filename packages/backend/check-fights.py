import sys
import json

response = json.load(sys.stdin)
fights = response['fights']

print('Fight statuses in database:\n')
print(f"Total fights: {len(fights)}")
print(f"Has started: {len([f for f in fights if f['hasStarted']])}")
print(f"Complete: {len([f for f in fights if f['isComplete']])}")
print(f"Live (started but not complete): {len([f for f in fights if f['hasStarted'] and not f['isComplete']])}")
print('\nMain card (first 5):')
for f in fights[:5]:
    print(f"  {f['fighter1']['firstName']} {f['fighter1']['lastName']} vs {f['fighter2']['firstName']} {f['fighter2']['lastName']}: hasStarted={f['hasStarted']}, complete={f['isComplete']}")
