/*******************************************************************************
 * Copyright (c) 2017 Microsoft Corporation and others. All rights reserved.
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v1.0 which accompanies this distribution,
 * and is available at http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors: Microsoft Corporation - initial API and implementation
 *******************************************************************************/

public class MyClass {
    public int multiply(int x, int y) {
        if (x > 999) {
            throw new IllegalArgumentException("X should be less than 1000");
        }
        return x * y;
    }
}
