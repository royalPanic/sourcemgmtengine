import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceDateTimeFields } from './SourceDateTimeFields';

describe('SourceDateTimeFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders date and time inputs', () => {
    const onChange = vi.fn();
    render(<SourceDateTimeFields date="2026-05-01" time="19:30" onChange={onChange} />);
    expect(screen.getByLabelText('Source date')).toHaveValue('2026-05-01');
    expect(screen.getByLabelText('Source time (24-hour, local)')).toHaveValue('19:30');
  });

  it('calls onChange when date changes', () => {
    const onChange = vi.fn();
    render(<SourceDateTimeFields date="" time="" onChange={onChange} />);
    const dateInput = screen.getByLabelText('Source date');

    fireEvent.change(dateInput, { target: { value: '2026-06-15' } });

    expect(onChange).toHaveBeenCalledWith({ date: '2026-06-15', time: '' });
  });

  it('clears time when date is cleared', () => {
    const onChange = vi.fn();
    render(<SourceDateTimeFields date="2026-05-01" time="19:30" onChange={onChange} />);
    const dateInput = screen.getByLabelText('Source date');

    fireEvent.change(dateInput, { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith({ date: '', time: '' });
  });

  it('calls onChange when time changes', () => {
    const onChange = vi.fn();
    render(<SourceDateTimeFields date="2026-05-01" time="" onChange={onChange} />);
    const timeInput = screen.getByLabelText('Source time (24-hour, local)');

    fireEvent.change(timeInput, { target: { value: '14:30' } });
    fireEvent.blur(timeInput);

    expect(onChange).toHaveBeenCalledWith({ date: '2026-05-01', time: '14:30' });
  });

  it('calls onValidityChange when time becomes invalid', () => {
    const onValidityChange = vi.fn();
    render(<SourceDateTimeFields date="2026-05-01" time="" onChange={vi.fn()} onValidityChange={onValidityChange} />);
    const timeInput = screen.getByLabelText('Source time (24-hour, local)');

    fireEvent.change(timeInput, { target: { value: '25:00' } });
    fireEvent.blur(timeInput);

    expect(onValidityChange).toHaveBeenCalledWith(false);
  });

  it('disables time input when no date is set', () => {
    render(<SourceDateTimeFields date="" time="" onChange={vi.fn()} />);
    const timeInput = screen.getByLabelText('Source time (24-hour, local)');
    expect(timeInput).toBeDisabled();
  });

  it('shows hint text when no time is set', () => {
    render(<SourceDateTimeFields date="2026-05-01" time="" onChange={vi.fn()} />);
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  it('does not show hint text when time is set', () => {
    render(<SourceDateTimeFields date="2026-05-01" time="19:30" onChange={vi.fn()} />);
    expect(screen.queryByText(/Optional/)).not.toBeInTheDocument();
  });
});
