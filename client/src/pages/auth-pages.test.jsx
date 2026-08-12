import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, expect, it } from 'vitest';
import { LoginPage } from './auth-pages.jsx';

const login=vi.fn();
vi.mock('../context/auth-context.jsx',()=>({useAuth:()=>({user:null,login,register:vi.fn()})}));
describe('login workflow',()=>{it('submits the demo credentials',async()=>{render(<MemoryRouter><LoginPage/></MemoryRouter>);await userEvent.click(screen.getByRole('button',{name:/sign in/i}));expect(login).toHaveBeenCalledWith({email:'admin@fleetflow.demo',password:'Demo1234'});});});
