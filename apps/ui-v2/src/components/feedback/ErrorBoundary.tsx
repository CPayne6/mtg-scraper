import { Component, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
            p: 3,
          }}
        >
          <Container maxWidth="sm">
            <Paper sx={{ p: { xs: 4, md: 5 }, textAlign: 'center' }}>
              <Stack spacing={2} alignItems="center">
                <Typography variant="h4">Something went wrong</Typography>
                <Typography variant="body2" color="text.secondary">
                  {this.state.error.message || 'An unexpected error occurred. Try reloading the page.'}
                </Typography>
                <Button variant="contained" color="primary" onClick={this.handleReload}>
                  Reload
                </Button>
              </Stack>
            </Paper>
          </Container>
        </Box>
      );
    }
    return this.props.children;
  }
}
