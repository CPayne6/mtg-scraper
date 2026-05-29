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
// import { CheckCircle } from '@mui/icons-material';
// import { RadioButtonUnchecked } from '@mui/icons-material';
// import { useAuth } from '@/components/auth/AuthContext';
// import { AuthSessionError } from '@/api/auth';

type SignupSearch = {
  redirect?: string;
  auth_error?: string;
};

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    auth_error:
      typeof search.auth_error === 'string' ? search.auth_error : undefined,
  }),
  component: SignupRoute,
});

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'google-not-configured':
    'Google sign-in is not configured on this server. Set AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET on the auth service.',
  'invalid-state':
    'Sign-up was interrupted. Please try again.',
  'email-not-verified':
    'Google has not verified that email. Verify it on your Google account and try again.',
  'sign-in-failed':
    'Could not complete Google sign-up. Please try again.',
  access_denied:
    'You cancelled the Google sign-in. You can try again anytime.',
};

function SignupRoute() {
  const { redirect, auth_error } = Route.useSearch();
  const errorMessage = auth_error
    ? AUTH_ERROR_MESSAGES[auth_error] ?? 'Sign-up failed. Please try again.'
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
              Get started
            </Typography>
            <Typography variant="h2" sx={{ fontSize: '1.75rem' }}>
              Create an account
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Use your Google account to save lists and sync across devices.
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

// Email/password signup form. Disabled until email verification ships.
// To restore: uncomment this function, remove the SignupRoute above, and
// uncomment the related imports at the top of the file plus the signup/login
// methods in AuthContext.
/*
type PasswordCheck = {
  label: string;
  test: (pw: string) => boolean;
};

const PASSWORD_CHECKS: PasswordCheck[] = [
  { label: '10+ characters', test: (pw) => pw.length >= 10 },
  { label: 'Lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Number', test: (pw) => /\d/.test(pw) },
  { label: 'Symbol', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function SignupRouteWithPassword() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const { redirect } = Route.useSearch();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkResults = PASSWORD_CHECKS.map((c) => ({ ...c, met: c.test(password) }));
  const passwordValid = checkResults.every((c) => c.met);
  const showChecklist = passwordFocused || password.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      setError('Password does not meet all requirements.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signup({ email, password, displayName: displayName || undefined });
      navigate({ to: redirect ?? '/' });
    } catch (err) {
      if (err instanceof AuthSessionError) {
        setError(err.message);
      } else {
        setError('Signup failed. Try again.');
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
              Get started
            </Typography>
            <Typography variant="h2" sx={{ fontSize: '1.75rem' }}>
              Create an account
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Save lists and sync across devices.
            </Typography>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Display name (optional)"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            slotProps={{
              htmlInput: {
                maxLength: 120,
                autoCapitalize: 'words',
                enterKeyHint: 'next',
              },
            }}
            fullWidth
          />
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
          <Box>
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              slotProps={{
                htmlInput: {
                  required: true,
                  minLength: 10,
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
            {showChecklist && (
              <Box
                role="list"
                aria-label="Password requirements"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 0.5,
                  mt: 1,
                  pl: 1.5,
                }}
              >
                {checkResults.map((c) => (
                  <Box
                    key={c.label}
                    role="listitem"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      fontSize: '0.78rem',
                      color: c.met ? 'primary.main' : 'text.secondary',
                      transition: 'color 200ms',
                    }}
                  >
                    {c.met ? (
                      <CheckCircle sx={{ fontSize: 14 }} />
                    ) : (
                      <RadioButtonUnchecked sx={{ fontSize: 14 }} />
                    )}
                    {c.label}
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={submitting || !passwordValid}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Already have an account?{' '}
            <Link
              to="/login"
              search={redirect ? { redirect } : undefined}
              style={{ color: 'inherit', fontWeight: 600 }}
            >
              Sign in
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
*/
