import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button (smoke)', () => {
  it('renders its children', () => {
    render(<Button>Hola</Button>);
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });
});
