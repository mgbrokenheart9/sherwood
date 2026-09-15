from decimal import Decimal

import pytest

from sherwood import format_usdg, to_usdg_units


@pytest.mark.parametrize(
    ("amount", "units"),
    [
        ("0.01", 10_000),
        ("1", 1_000_000),
        (" 2.5 ", 2_500_000),
        (0.5, 500_000),
        (3, 3_000_000),
        (Decimal("12.345678"), 12_345_678),
        ("0", 0),
        ("0.000001", 1),
    ],
)
def test_to_usdg_units(amount, units):
    assert to_usdg_units(amount) == units


@pytest.mark.parametrize("amount", ["0.0000001", "-1", "abc", "NaN", "Infinity", ""])
def test_to_usdg_units_rejects_invalid_amounts(amount):
    with pytest.raises(ValueError):
        to_usdg_units(amount)


def test_to_usdg_units_rejects_booleans():
    with pytest.raises(TypeError):
        to_usdg_units(True)


@pytest.mark.parametrize(
    ("units", "text"),
    [(10_000, "0.01"), (1_000_000, "1"), (12_345_678, "12.345678"), (0, "0"), (10_000_000, "10"), (1, "0.000001")],
)
def test_format_usdg(units, text):
    assert format_usdg(units) == text
    assert to_usdg_units(text) == units
