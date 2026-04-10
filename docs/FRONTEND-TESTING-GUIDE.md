# Frontend Testing Guide

## Overview
React 19 frontend with Vite, Testing Library, and Vitest.

## Tech Stack
- React 19.2.4
- Vite 8.0.4
- Testing Library (@testing-library/react)
- Vitest

## Required Setup

### 1. Install dependencies
```bash
npm install --save-dev @testing-library/react @testing-library/user-event @testing-library/dom jsdom vitest
```

### 2. Create src/test/setup.ts
```typescript
import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom';

// Extend Vitest expect with jest-dom matchers
expect.extend(matchers);

// Mock Clerk auth
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({
    isSignedIn: true,
    user: { id: 'user123', name: 'Test User' },
  }),
  useClerk: () => ({
    clerk: { getToken: () => Promise.resolve('test-token') },
  }),
}));
```

### 3. Create vitest config (add to existing or create projects in root vitest.config.ts)

Add a frontend project:
```typescript
test: {
  projects: [
    {
      extends: true,
      test: {
        name: 'frontend',
        include: ['src/**/*.test.{ts,tsx}'],
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
      },
    },
  ],
}
```

## Test Patterns

### Pattern 1: Simple Component Test
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TaskCard } from '../components/TaskCard';

describe('TaskCard', () => {
  it('renders task title', () => {
    render(<TaskCard title="Test Task" status="todo" />);
    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });
  
  it('shows priority badge for high priority', () => {
    render(<TaskCard title="Urgent" priority={4} />);
    expect(screen.getByText('Urgent')).toHaveAttribute('data-priority', '4');
  });
});
```

### Pattern 2: Testing User Interactions
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { TaskForm } from '../components/TaskForm';

describe('TaskForm', () => {
  it('submits form with correct data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    
    render(<TaskForm onSubmit={onSubmit} />);
    
    await user.type(screen.getByLabelText('Title'), 'New Task');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'New Task',
      status: 'todo',
    });
  });
});
```

### Pattern 3: Testing with Convex Mocks
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../convex/_generated/api';
import { useQuery } from 'convex/react';

// Mock the hook
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('TaskList', () => {
  it('shows loading state', () => {
    (useQuery as any).mockReturnValue(undefined);
    
    render(<TaskList entityId="entity1" />, { wrapper: TestWrapper });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
  
  it('shows tasks when loaded', () => {
    (useQuery as any).mockReturnValue([
      { _id: 'task1', title: 'Task 1', status: 'todo' },
    ]);
    
    render(<TaskList entityId="entity1" />, { wrapper: TestWrapper });
    expect(screen.getByText('Task 1')).toBeInTheDocument();
  });
});
```

### Pattern 4: Testing Auth-Gated Components
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ isSignedIn: false }),
}));

describe('PrivateRoute', () => {
  it('redirects to sign-in when not authenticated', () => {
    render(
      <MemoryRouter>
        <PrivateRoute>
          <div>Protected Content</div>
        </PrivateRoute>
      </MemoryRouter>
    );
    
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
```

## What to Test

| Component | What to Test |
|-----------|--------------|
| TaskCard | Renders correctly, priority colors, status badge |
| TaskForm | Validation, submission, error handling |
| TaskList | Loading, empty, with tasks, filtering |
| AgentsView | Token creation, display, revocation |
| InboxView | List items, mark processed, source display |
| Layout | Navigation, auth state |

## Mocking Guidelines

```typescript
// Mock Convex
vi.mock('../convex/_generated/api', () => ({
  api: {
    tasks: {
      list: { name: 'tasks.list', kind: 'query' },
      create: { name: 'tasks.create', kind: 'mutation' },
    },
  },
}));

// Mock Clerk
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ isSignedIn: true }),
  useClerk: () => ({ clerk: { getToken: () => Promise.resolve('token') } }),
}));
```