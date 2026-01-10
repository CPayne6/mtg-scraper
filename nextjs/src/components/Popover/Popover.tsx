import { Popover as ChakraPopover, PopoverRootProps, Portal } from '@chakra-ui/react'

interface PopoverProps extends PopoverRootProps {
  trigger: React.ReactNode
  title?: React.ReactNode
}

export const Popover = ({ title, trigger, children, ...rootProps }: PopoverProps) => {
  return <ChakraPopover.Root {...rootProps}>
    <ChakraPopover.Trigger asChild>
      {trigger}
    </ChakraPopover.Trigger>
    <Portal>
      <ChakraPopover.Positioner>
        <ChakraPopover.Content>
          <ChakraPopover.Arrow />
          <ChakraPopover.Body>
            {title && <ChakraPopover.Title fontWeight="medium">{title}</ChakraPopover.Title>}
            {children}
          </ChakraPopover.Body>
        </ChakraPopover.Content>
      </ChakraPopover.Positioner>
    </Portal>
  </ChakraPopover.Root>
}