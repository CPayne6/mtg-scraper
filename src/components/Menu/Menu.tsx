import { Menu as ChakraMenu, Portal } from "@chakra-ui/react"

interface MenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export const Menu = (props: MenuProps) => {
  return (
    <ChakraMenu.Root>
      <ChakraMenu.Trigger asChild>
        {props.trigger}
      </ChakraMenu.Trigger>
      <Portal>
        <ChakraMenu.Positioner>
          <ChakraMenu.Content>
            {props.children}
          </ChakraMenu.Content>
        </ChakraMenu.Positioner>
      </Portal>
    </ChakraMenu.Root>
  )
}

export const MenuItem = ChakraMenu.Item