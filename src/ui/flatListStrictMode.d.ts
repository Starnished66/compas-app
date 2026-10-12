import 'react-native';

declare module 'react-native' {
  // FlatList.js supports strictMode (memoized item renderer), but the public typings omit it.
  interface FlatListProps<ItemT> {
    strictMode?: boolean;
  }
}
