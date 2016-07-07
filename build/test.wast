(module
    (memory 1)

    (export "growMemory" $growMemory)
    (func $growMemory (param $0 i32) (result i32) (grow_memory (get_local $0)))

    (export "getMemorySize" $getMemorySize)
    (func $getMemorySize (result i32) (current_memory))
)
