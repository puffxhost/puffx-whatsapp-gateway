#!/usr/bin/env python3
"""Turn the walkthrough's 24-bit BMP frames into a looping 256-color GIF."""

from __future__ import annotations

import struct
import sys
from collections import Counter
from pathlib import Path


def read_bmp(path: Path) -> tuple[int, int, list[tuple[int, int, int]]]:
    raw = path.read_bytes()
    if raw[:2] != b"BM":
        raise ValueError(f"Not a BMP file: {path}")
    pixel_offset = struct.unpack_from("<I", raw, 10)[0]
    width, signed_height = struct.unpack_from("<ii", raw, 18)
    bits = struct.unpack_from("<H", raw, 28)[0]
    if bits != 24 or signed_height < 0:
        raise ValueError("Expected a bottom-up 24-bit BMP frame")
    height = signed_height
    stride = (width * 3 + 3) & ~3
    colors: list[tuple[int, int, int]] = []
    for y in range(height):
        row = pixel_offset + (height - 1 - y) * stride
        for x in range(width):
            b, g, r = raw[row + x * 3 : row + x * 3 + 3]
            colors.append((r, g, b))
    return width, height, colors


def make_palette(histogram: Counter[tuple[int, int, int]]) -> list[tuple[int, int, int]]:
    boxes: list[list[tuple[tuple[int, int, int], int]]] = [list(histogram.items())]
    while len(boxes) < 256:
        candidates = []
        for i, box in enumerate(boxes):
            if len(box) < 2:
                continue
            spans = [max(c[channel] for c, _ in box) - min(c[channel] for c, _ in box) for channel in range(3)]
            channel = max(range(3), key=spans.__getitem__)
            score = spans[channel] * sum(count for _, count in box)
            candidates.append((score, i, channel))
        if not candidates:
            break
        _, box_index, channel = max(candidates)
        box = sorted(boxes.pop(box_index), key=lambda item: item[0][channel])
        halfway = sum(count for _, count in box) / 2
        total = 0
        split = 1
        for split, (_, count) in enumerate(box, 1):
            total += count
            if total >= halfway:
                break
        split = min(max(split, 1), len(box) - 1)
        boxes.extend((box[:split], box[split:]))

    palette = []
    for box in boxes:
        count = sum(weight for _, weight in box)
        palette.append(
            tuple(
                round(sum(color[channel] * weight for color, weight in box) / count)
                for channel in range(3)
            )
        )
    while len(palette) < 256:
        palette.append((0, 0, 0))
    return palette


def make_index_map(
    histogram: Counter[tuple[int, int, int]], palette_size: int
) -> dict[tuple[int, int, int], int]:
    boxes: list[list[tuple[tuple[int, int, int], int]]] = [list(histogram.items())]
    while len(boxes) < palette_size:
        candidates = []
        for i, box in enumerate(boxes):
            if len(box) < 2:
                continue
            spans = [max(c[channel] for c, _ in box) - min(c[channel] for c, _ in box) for channel in range(3)]
            channel = max(range(3), key=spans.__getitem__)
            candidates.append((spans[channel] * sum(count for _, count in box), i, channel))
        if not candidates:
            break
        _, box_index, channel = max(candidates)
        box = sorted(boxes.pop(box_index), key=lambda item: item[0][channel])
        halfway = sum(count for _, count in box) / 2
        total = 0
        split = 1
        for split, (_, count) in enumerate(box, 1):
            total += count
            if total >= halfway:
                break
        split = min(max(split, 1), len(box) - 1)
        boxes.extend((box[:split], box[split:]))
    return {color: i for i, box in enumerate(boxes) for color, _ in box}


def quantize_palette(histogram: Counter[tuple[int, int, int]]) -> tuple[list[tuple[int, int, int]], dict[tuple[int, int, int], int]]:
    # Split once and derive both the palette and its exact color-to-index map.
    boxes: list[list[tuple[tuple[int, int, int], int]]] = [list(histogram.items())]
    while len(boxes) < 256:
        candidates = []
        for i, box in enumerate(boxes):
            if len(box) < 2:
                continue
            spans = [max(c[ch] for c, _ in box) - min(c[ch] for c, _ in box) for ch in range(3)]
            channel = max(range(3), key=spans.__getitem__)
            candidates.append((spans[channel] * sum(count for _, count in box), i, channel))
        if not candidates:
            break
        _, i, channel = max(candidates)
        box = sorted(boxes.pop(i), key=lambda item: item[0][channel])
        midpoint = sum(count for _, count in box) / 2
        weight = 0
        split = 1
        for split, (_, count) in enumerate(box, 1):
            weight += count
            if weight >= midpoint:
                break
        split = min(max(split, 1), len(box) - 1)
        boxes.extend((box[:split], box[split:]))

    palette = []
    mapping: dict[tuple[int, int, int], int] = {}
    for index, box in enumerate(boxes):
        total = sum(count for _, count in box)
        palette.append(tuple(round(sum(color[ch] * count for color, count in box) / total) for ch in range(3)))
        for color, _ in box:
            mapping[color] = index
    while len(palette) < 256:
        palette.append((0, 0, 0))
    return palette, mapping


def lzw(indices: bytes) -> bytes:
    clear, end = 256, 257
    codes: list[tuple[int, int]] = []
    code_size = 9
    next_code = 258
    table = {bytes((i,)): i for i in range(256)}
    codes.append((clear, code_size))
    prefix = bytes((indices[0],))
    for pixel in indices[1:]:
        suffix = bytes((pixel,))
        joined = prefix + suffix
        if joined in table:
            prefix = joined
            continue
        codes.append((table[prefix], code_size))
        if next_code < 4096:
            table[joined] = next_code
            next_code += 1
            if next_code > (1 << code_size) and code_size < 12:
                code_size += 1
        else:
            codes.append((clear, code_size))
            table = {bytes((i,)): i for i in range(256)}
            code_size, next_code = 9, 258
        prefix = suffix
    codes.append((table[prefix], code_size))
    codes.append((end, code_size))

    output = bytearray()
    accumulator = bit_count = 0
    for code, size in codes:
        accumulator |= code << bit_count
        bit_count += size
        while bit_count >= 8:
            output.append(accumulator & 0xFF)
            accumulator >>= 8
            bit_count -= 8
    if bit_count:
        output.append(accumulator & 0xFF)
    return bytes(output)


def subblocks(data: bytes) -> bytes:
    out = bytearray()
    for offset in range(0, len(data), 255):
        block = data[offset : offset + 255]
        out.append(len(block))
        out.extend(block)
    out.append(0)
    return bytes(out)


def main() -> None:
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    frame_paths = sorted(source.glob("frame-*.bmp"))
    if not frame_paths:
        raise SystemExit("No BMP frames found")
    decoded = [read_bmp(path) for path in frame_paths]
    width, height = decoded[0][:2]
    if any((w, h) != (width, height) for w, h, _ in decoded):
        raise SystemExit("Frame sizes do not match")

    histogram: Counter[tuple[int, int, int]] = Counter()
    for _, _, colors in decoded:
        histogram.update(colors)
    palette, mapping = quantize_palette(histogram)

    header = bytearray(b"GIF89a")
    header.extend(struct.pack("<HHBBB", width, height, 0xF7, 0, 0))
    for red, green, blue in palette:
        header.extend((red, green, blue))
    # Infinite loop; each illustrated step remains readable for 2.1 seconds.
    header.extend(b"!\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00")
    for _, _, colors in decoded:
        indexed = bytes(mapping[color] for color in colors)
        # Full-frame replacement (disposal 2) and 70 centiseconds per frame.
        header.extend(b"!\xf9\x04\x08\x46\x00\x00\x00")
        header.append(0x2C)
        header.extend(struct.pack("<HHHHB", 0, 0, width, height, 0))
        header.append(8)
        header.extend(subblocks(lzw(indexed)))
    header.append(0x3B)
    target.write_bytes(header)
    print(f"Encoded {len(frame_paths)} frames to {target} ({target.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
