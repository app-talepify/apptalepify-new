if(NOT TARGET shopify_react-native-skia::rnskia)
add_library(shopify_react-native-skia::rnskia SHARED IMPORTED)
set_target_properties(shopify_react-native-skia::rnskia PROPERTIES
    IMPORTED_LOCATION "C:/Dev/TalepifyApp12/node_modules/@shopify/react-native-skia/android/build/intermediates/cxx/Debug/5514656l/obj/arm64-v8a/librnskia.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Dev/TalepifyApp12/node_modules/@shopify/react-native-skia/android/build/headers/rnskia"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

