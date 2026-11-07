import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeInput } from './TimeInput';

describe('TimeInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with the current time value', () => {
    render(<TimeInput date="2026-05-01" time="19:30" onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText('HH:MM');
    expect(input).toHaveValue('19:30');
  });

  it('is disabled when disabled prop is true', () => {
    render(<TimeInput date="2026-05-01" time="19:30" onChange={vi.fn()} disabled />);
    const input = screen.getByPlaceholderText('HH:MM');
    expect(input).toBeDisabled();
  });

  it('calls onChange with normalized time on blur', () => {
    const onChange = vi.fn();
    render(<TimeInput date="2026-05-01" time="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('HH:MM');

    fireEvent.change(input, { target: { value: '9:5' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith('09:05');
  });

  it('calls onValidityChange with false for invalid time', () => {
    const onValidityChange = vi.fn();
    render(<TimeInput date="2026-05-01" time="" onChange={vi.fn()} onValidityChange={onValidityChange} />);
    const input = screen.getByPlaceholderText('HH:MM');

    fireEvent.change(input, { target: { value: '25:00' } });
    fireEvent.blur(input);

    expect(onValidityChange).toHaveBeenCalledWith(false);
  });

  it('calls onValidityChange with true for valid time', () => {
    const onValidityChange = vi.fn();
    render(<TimeInput date="2026-05-01" time="" onChange={vi.fn()} onValidityChange={onValidityChange} />);
    const input = screen.getByPlaceholderText('HH:MM');

    fireEvent.change(input, { target: { value: '09:05' } });
    fireEvent.blur(input);

    expect(onValidityChange).toHaveBeenCalledWith(true);
  });

  it('commits on Enter key', () => {
    const onChange = vi.fn();
    render(<TimeInput date="2026-05-01" time="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('HH:MM');

    fireEvent.change(input, { target: { value: '14:30' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('14:30');
  });

  it('shows UTC equivalent when date and time are valid', () => {
    render(<TimeInput date="2026-05-01" time="19:30" onChange={vi.fn()} />);
    // The UTC hint is rendered as text after the input
    expect(screen.getByText(/UTC/)).toBeInTheDocument();
  });

  it('does not show UTC when time is invalid', () => {
    render(<TimeInput date="2026-05-01" time="invalid" onChange={vi.fn()} />);
    // No UTC text should appear
    expect(screen.queryByText(/UTC/)).not.toBeInTheDocument();
  });

  it('updates when the time prop changes externally', () => {
    const { rerender } = render(<TimeInput date="2026-05-01" time="09:00" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('HH:MM')).toHaveValue('09:00');

    rerender(<TimeInput date="2026-05-01" time="17:00" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('HH:MM')).toHaveValue('17:00');
  });
});
