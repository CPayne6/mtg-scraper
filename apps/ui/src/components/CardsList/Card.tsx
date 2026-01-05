import MuiCard from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { Image } from "../Image";
import { BsClipboard2Plus } from "react-icons/bs";

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
  return (
    <MuiCard
      sx={{
        width: '100%',
        maxWidth: 300,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px'
      }}
    >
      <Box sx={{
        width: '100%',
        bgcolor: 'background.default',
        aspectRatio: '5/7',
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        <Image
          src={props.image}
          alt={props.title}
          style={{ borderRadius: '12px' }}
        />
      </Box>
      <CardContent sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        flex: 1,
        pb: 1
      }}>
        <Tooltip title={`${props.title} (${props.set})`}>
          <Typography
            variant="h6"
            component="div"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              fontWeight: 700,
              lineHeight: 1.3,
              fontSize: '1.1rem',
              color: 'text.primary',
              minHeight: '2.86em'
            }}
          >
            {props.title}
          </Typography>
        </Tooltip>
        <Typography
          variant="body2"
          sx={{
            color: 'text.primary',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontSize: '0.85rem'
          }}
        >
          {props.set}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            fontSize: '0.875rem'
          }}
        >
          {props.store}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 'auto', pt: 0.5 }}>
          <Typography
            variant="body1"
            sx={{
              color: 'text.primary',
              fontWeight: 600,
              fontSize: '1rem'
            }}
          >
            ${props.price.toFixed(2)}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.primary',
              fontSize: '0.875rem',
              textTransform: 'uppercase'
            }}
          >
            | {props.condition}
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
                <BsClipboard2Plus />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </CardActions>
    </MuiCard>
  )
}
