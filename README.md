# Star Wars: The Card Game LCG - API

## Overview

This respository contains API documetation to manage the card database.

The documentation is written using the [API Blueprint](http://apiblueprint.org/) format.

## Generate Documentation

In order to generate documentation, you must install the [aglio](https://github.com/danielgtaylor/aglio) project via npm:

```
npm install -g aglio
```

After aglio is installed, you can generate documentation via command:

```
aglio -t default-multi --input api.md --output api.html
```

... or you can run a server locally to view live updates:

```
aglio -t default-multi --input api.md --server
```

Refer to more usage examples on the [project readme](https://github.com/danielgtaylor/aglio#executable).
