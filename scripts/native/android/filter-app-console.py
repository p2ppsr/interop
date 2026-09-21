#!/usr/bin/env python3
"""Keep bounded, redacted application errors from a private Android logcat stream."""

import re
import sys
from collections import deque


observations = deque(maxlen=300)
for line in sys.stdin:
    if not any(tag in line for tag in ('CONSOLE', 'ReactNativeJS', 'WebViewConsole')):
        continue
    line = re.sub(r'\b[0-9a-fA-F]{32,}\b', '[hex]', line)
    line = re.sub(r'\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[token]', line)
    line = re.sub(r'\b[A-Za-z0-9+/=_-]{48,}\b', '[opaque]', line)
    line = re.sub(r'\b\d{6,}\b', '[number]', line)
    line = line.replace('TPNIL-Fixture-2026!', '[fixture-password]')
    observations.append(line[:1000].rstrip())

for line in observations:
    sys.stdout.write(line + '\n')
