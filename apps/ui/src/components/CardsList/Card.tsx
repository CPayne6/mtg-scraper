import MuiCard from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { Theme } from "@mui/material/styles";
import { Image } from "../Image";
import AssignmentAdd from "@mui/icons-material/AssignmentAdd";
import { useSets } from "@/context";

interface CardProps {
  title: string;
  store: string;
  price: number;
  image: string;
  link: string;
  condition: string;
  set: string;
  inLibrary: boolean;
  addToLibrary: () => void;
}

export function Card(props: CardProps) {
  const { getSetName } = useSets();
  const setName = getSetName(props.set);
  return (
    <MuiCard
      sx={{
        width: '100%',
        maxWidth: 300,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        boxShadow: (theme: Theme) => theme.palette.mode === 'dark' ? 6 : 2
      }}
    >
      <Box sx={{
        width: '100%',
        bgcolor: 'background.default',
        aspectRatio: '5/7',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <Image
          src={props.image}
          alt={`${props.title} from ${setName}`}
          style={{ borderRadius: '8px' }}
        />
      </Box>
      <CardContent sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        flex: 1,
        pb: 1
      }}>
        <Typography
          variant="h6"
          sx={{
            color: 'text.primary',
            fontWeight: 600,
            fontSize: '1rem'
          }}
        >
          {props.store}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            fontSize: '0.875rem'
          }}
        >
          {setName}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 'auto', pt: 0.5 }}>
          <Typography
            variant="body1"
            sx={{
              color: 'text.primary',
              fontWeight: 600,
              fontSize: '1rem',
            }}
          >
            ${props.price.toFixed(2)}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: 'text.primary',
              fontWeight: 600,
              fontSize: '1rem',
            }}
          >
            |
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: 'text.primary',
              fontSize: '1rem',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {props.condition}
          </Typography>
        </Stack>
      </CardContent>
      <CardActions sx={{ p: 2, pt: 0 }}>
        <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
          <Button
            size="small"
            variant="contained"
            href={props.link}
            target="_blank"
            component="a"
            sx={{
              flex: 1,
              fontWeight: 600,
              textTransform: 'none'
            }}
          >
            View in Store
          </Button>
          <Tooltip title={props.inLibrary ? "Already in library" : "Add to library"}>
            <span>
              <IconButton
                disabled={props.inLibrary}
                onClick={props.addToLibrary}
                size="small"
                color="primary"
                sx={{
                  border: 1,
                  borderColor: props.inLibrary ? 'action.disabled' : 'primary.main',
                  '&:hover': {
                    bgcolor: 'primary.main',
                    color: 'white'
                  }
                }}
              >
                <AssignmentAdd />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </CardActions>
    </MuiCard>
  )
}
