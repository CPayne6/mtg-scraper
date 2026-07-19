import { createFileRoute } from '@tanstack/react-router';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { Google as GoogleIcon } from '@mui/icons-material';
import { googleSignInUrl } from '@/api/auth';

// Imports below are retained for the email/password flow that will return once
// email verification ships.
// import { useState, type FormEvent } from 'react';
// import { Link, useNavigate } from '@tanstack/react-router';
// import TextField from '@mui/material/TextField';
// import IconButton from '@mui/material/IconButton';
// import InputAdornment from '@mui/material/InputAdornment';
// import { Visibility } from '@mui/icons-material';
// import { VisibilityOff } from '@mui/icons-material';
// import { useAuth } from '@/components/auth/AuthContext';
// import { AuthSessionError } from '@/api/auth';

type LoginSearch = {
  redirect?: string;
  auth_error?: string;
};

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    auth_error:
      typeof search.auth_error === 'string' ? search.auth_error : undefined,
  }),
  component: LoginRoute,
});

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'google-not-configured':
    'Google sign-in is not configured on this server. Set AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET on the auth service.',
  'invalid-state':
    'Sign-in was interrupted. Please try again.',
  'email-not-verified':
    'Google has not verified that email. Verify it on your Google account and try again.',
  'email-not-authoritative':
    'We cannot link this Google account to an existing ScoutLGS profile right now. Please contact support if you believe this is wrong.',
  'sign-in-failed':
    'Could not complete Google sign-in. Please try again.',
  access_denied:
    'You cancelled the Google sign-in. You can try again anytime.',
};

function LoginRoute() {
  const { redirect, auth_error } = Route.useSearch();
  const errorMessage = auth_error
    ? AUTH_ERROR_MESSAGES[auth_error] ?? 'Sign-in failed. Please try again.'
    : null;
  const href = googleSignInUrl(redirect);

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
        <Stack spacing={2.5}>
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
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Sign in with Google to save lists and sync across devices.
            </Typography>
          </Box>

          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

          <Button
            component="a"
            href={href}
            variant="contained"
            color="primary"
            size="large"
            startIcon={<GoogleIcon />}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Continue with Google
          </Button>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: 'center' }}
          >
            We only use Google to confirm your email. We never post on your
            behalf.
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}

// Email/password sign-in form. Disabled until email verification ships.
// To restore: uncomment this function, remove the LoginRoute above, and
// uncomment the related imports at the top of the file plus the signup/login
// methods in AuthContext.
/*
function LoginRouteWithPassword() {
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
*/
