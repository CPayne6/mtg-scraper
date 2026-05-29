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
import CheckCircle from '@mui/icons-material/CheckCircle';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import { useAuth } from '@/components/auth/AuthContext';
import { AuthSessionError } from '@/api/auth';

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

type SignupSearch = {
  redirect?: string;
};

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: SignupRoute,
});

function SignupRoute() {
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
