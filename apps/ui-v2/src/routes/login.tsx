import { useState, type FormEvent } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useAuth } from '@/components/auth/AuthContext';
import { AuthSessionError } from '@/api/auth';

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { redirect } = Route.useSearch();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate({ to: redirect ?? '/' });
    } catch (err) {
      if (err instanceof AuthSessionError) {
        setError(err.message);
      } else {
        setError('Login failed. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth={false} sx={{ maxWidth: 440, px: { xs: 0, sm: 2 } }}>
      <Paper
        sx={{
          borderRadius: { xs: 0, sm: 3 },
          boxShadow: { xs: 0, sm: 2 },
          bgcolor: { xs: 'transparent', sm: 'background.paper' },
          p: { xs: 2, sm: 4, md: 4.5 },
        }}
      >
        <Stack component="form" spacing={2.5} onSubmit={handleSubmit} noValidate>
          <Box>
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'primary.main',
                mb: 0.5,
              }}
            >
              Welcome back
            </Typography>
            <Typography variant="h2" sx={{ fontSize: '1.75rem' }}>
              Sign in
            </Typography>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            slotProps={{
              htmlInput: {
                required: true,
                inputMode: 'email',
                autoCapitalize: 'none',
                autoCorrect: 'off',
                spellCheck: false,
                enterKeyHint: 'next',
              },
            }}
            fullWidth
          />
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            slotProps={{
              htmlInput: {
                required: true,
                minLength: 8,
                enterKeyHint: 'go',
              },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((s) => !s)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            fullWidth
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Don't have an account?{' '}
            <Link
              to="/signup"
              search={redirect ? { redirect } : undefined}
              style={{ color: 'inherit', fontWeight: 600 }}
            >
              Create one
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
